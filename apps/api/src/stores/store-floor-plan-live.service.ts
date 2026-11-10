import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { parseLangameDate } from '../integrations/langame-date';
import { LangameClient } from '../integrations/langame.client';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type {
  LangameGuestSession,
  LangameOperationLog,
  LangamePcTypeInClub,
  LangamePcTypeLink,
  LangameProductExpense,
  LangameWorkingShift,
} from '../integrations/langame.types';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';

export type StoreFloorPlanLivePc = {
  /** Computer name in Langame, as the club calls it. */
  name: string;
  /** Seat number taken from the name, the key the floor plan matches on. */
  number: number | null;
  type: string | null;
  busy: boolean;
  /** When the current session ends, if Langame says so. */
  busyUntil: string | null;
};

/** One line of a sale of goods or services at the club bar. */
export type StoreFloorPlanLivePurchase = {
  at: string | null;
  title: string;
  category: string | null;
  quantity: number;
  sum: number;
};

export type StoreFloorPlanLiveView = {
  storeId: string;
  status: 'LIVE' | 'NOT_CONNECTED' | 'UNAVAILABLE';
  generatedAt: string;
  pcs: StoreFloorPlanLivePc[];
  guests: number | null;
  shift: {
    adminName: string | null;
    startedAt: string | null;
  } | null;
  revenue: {
    period: 'SHIFT' | 'TODAY';
    since: string;
    total: number | null;
    goods: number | null;
    goodsCount: number | null;
  } | null;
  /**
   * Latest goods and services sold in the shift (or today), newest first.
   * Game time is not here: Langame sells it through sessions, not goods.
   * `null` when Langame did not answer.
   */
  purchases: StoreFloorPlanLivePurchase[] | null;
  warnings: string[];
};

type LiveStore = {
  id: string;
  tenantId: string;
  timeZone: string | null;
  externalProvider: IntegrationProvider | null;
  externalDomain: string | null;
  externalClubId: string | null;
  integrationSourceId: string | null;
};

type LangameSource = { id: string; domain: string; baseUrl: string };

type PcCatalog = {
  pcs: Array<{ uuid: string; name: string; type: string | null }>;
};

type CacheEntry<T> = { expiresAt: number; value: Promise<T> };

/** Several viewers of one club share one Langame read per window. */
const SNAPSHOT_TTL_MS = 15_000;
/** The list of computers changes rarely. */
const PC_CATALOG_TTL_MS = 10 * 60_000;
const CACHE_LIMIT = 200;
const LANGAME_TIMEOUT_MS = 8_000;
const SESSION_PAGE_LIMIT = 500;
const SESSION_PAGES = 6;
const SHIFT_PAGE_LIMIT = 50;
const SHIFT_PAGES = 3;
const EXPENSE_PAGE_LIMIT = 500;
const EXPENSE_PAGES = 10;
const PURCHASES_SHOWN = 8;
const DAY_MS = 24 * 60 * 60_000;

function text(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function amount(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(',', '.'))
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function truthy(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** Seat number from a Langame computer name: «ПК 17», «PC-17», «17». */
export function seatNumberFromName(name: string): number | null {
  const matches = name.match(/\d+/gu);
  if (!matches || matches.length === 0) return null;
  const parsed = Number(matches[matches.length - 1]);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed < 10_000
    ? parsed
    : null;
}

/** Calendar day of `date` in the club's time zone, as Langame takes it. */
function localDay(date: Date, timeZone: string | null) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Club-local midnight of today, as an instant. */
function localMidnight(now: Date, timeZone: string | null) {
  return (
    parseLangameDate(`${localDay(now, timeZone)} 00:00:00`, timeZone) ??
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    )
  );
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Live state of a club for its floor plan («Схема клуба»): which computers
 * are busy, the administrator and the revenue of the current shift. It is a
 * corporate user read: Langame is read through the tenant's own key and
 * nothing is written, neither to Langame nor to the database. No database
 * transaction is held while Langame answers.
 */
@Injectable()
export class StoreFloorPlanLiveService {
  private readonly logger = new Logger(StoreFloorPlanLiveService.name);
  private readonly snapshots = new Map<
    string,
    CacheEntry<StoreFloorPlanLiveView>
  >();
  private readonly catalogs = new Map<string, CacheEntry<PcCatalog>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly freshStoreScopeService: FreshStoreScopeService,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameClient: LangameClient,
  ) {}

  async get(
    storeId: string,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<StoreFloorPlanLiveView> {
    const scope = await this.freshStoreScopeService.resolveRequestedStoreIds(
      user,
      [storeId],
    );
    const store = await this.prisma.store.findFirst({
      where: { tenantId: scope.tenantId, id: storeId },
      select: {
        id: true,
        tenantId: true,
        timeZone: true,
        externalProvider: true,
        externalDomain: true,
        externalClubId: true,
        integrationSourceId: true,
      },
    });

    if (!store) {
      throw new NotFoundException('Клуб не найден');
    }

    const key = `${store.tenantId}:${store.id}`;
    return this.cached(this.snapshots, key, SNAPSHOT_TTL_MS, now, () =>
      this.buildSnapshot(store, now),
    );
  }

  private cached<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    ttlMs: number,
    now: Date,
    load: () => Promise<T>,
  ): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now.getTime()) {
      return hit.value;
    }

    if (cache.size >= CACHE_LIMIT) {
      for (const [entryKey, entry] of cache) {
        if (entry.expiresAt <= now.getTime()) cache.delete(entryKey);
      }
      if (cache.size >= CACHE_LIMIT) {
        for (const oldest of cache.keys()) {
          cache.delete(oldest);
          break;
        }
      }
    }

    const value = load();
    cache.set(key, { expiresAt: now.getTime() + ttlMs, value });
    // A failed read is not remembered: the next poll asks Langame again.
    value.catch(() => {
      if (cache.get(key)?.value === value) cache.delete(key);
    });
    return value;
  }

  private empty(
    store: LiveStore,
    now: Date,
    status: StoreFloorPlanLiveView['status'],
    warning: string,
  ): StoreFloorPlanLiveView {
    return {
      storeId: store.id,
      status,
      generatedAt: now.toISOString(),
      pcs: [],
      guests: null,
      shift: null,
      revenue: null,
      purchases: null,
      warnings: [warning],
    };
  }

  private async buildSnapshot(
    store: LiveStore,
    now: Date,
  ): Promise<StoreFloorPlanLiveView> {
    if (store.externalProvider !== IntegrationProvider.LANGAME) {
      return this.empty(
        store,
        now,
        'NOT_CONNECTED',
        'Клуб не подключён к Langame, на схеме нет живых данных.',
      );
    }

    let apiKey: string;
    let source: LangameSource | null;
    try {
      const access = await this.langameSettingsService.resolveTenantAccess(
        store.tenantId,
      );
      apiKey = access.apiKey;
      source = this.sourceForStore(store, access.sources);
    } catch {
      return this.empty(
        store,
        now,
        'NOT_CONNECTED',
        'Подключение к Langame не настроено.',
      );
    }

    if (!source) {
      return this.empty(
        store,
        now,
        'NOT_CONNECTED',
        'Для клуба не найден активный домен Langame.',
      );
    }

    const warnings: string[] = [];
    const langame = { source, apiKey };

    const [catalogResult, sessionsResult, shiftResult] =
      await Promise.allSettled([
        this.cached(
          this.catalogs,
          `${store.tenantId}:${source.domain}:${store.externalClubId ?? ''}`,
          PC_CATALOG_TTL_MS,
          now,
          () => this.loadPcCatalog(store, langame),
        ),
        this.loadActiveSessions(store, langame, now),
        this.loadOpenShift(store, langame),
      ]);

    const catalog =
      catalogResult.status === 'fulfilled' ? catalogResult.value : null;
    if (!catalog) {
      this.logFailure('pc catalog', catalogResult);
      warnings.push('Не удалось получить список компьютеров из Langame.');
    }

    const sessions =
      sessionsResult.status === 'fulfilled' ? sessionsResult.value : null;
    if (!sessions) {
      this.logFailure('sessions', sessionsResult);
      warnings.push('Не удалось получить текущие сеансы из Langame.');
    }

    const openShift =
      shiftResult.status === 'fulfilled' ? shiftResult.value : null;
    if (shiftResult.status === 'rejected') {
      this.logFailure('working shifts', shiftResult);
      warnings.push('Не удалось получить смену из Langame.');
    }

    const clubUuids = new Set(catalog?.pcs.map((pc) => pc.uuid) ?? []);
    const busyByUuid = new Map<string, Date | null>();
    const guestIds = new Set<string>();
    for (const session of sessions ?? []) {
      if (!clubUuids.has(session.uuid)) continue;
      const previous = busyByUuid.get(session.uuid);
      if (
        previous === undefined ||
        (previous !== null &&
          (session.stop === null || session.stop > previous))
      ) {
        busyByUuid.set(session.uuid, session.stop);
      }
      guestIds.add(session.guestKey);
    }

    const pcs: StoreFloorPlanLivePc[] = (catalog?.pcs ?? []).map((pc) => {
      const busyUntil = busyByUuid.get(pc.uuid);
      return {
        name: pc.name,
        number: seatNumberFromName(pc.name),
        type: pc.type,
        busy: busyUntil !== undefined,
        busyUntil: busyUntil ? busyUntil.toISOString() : null,
      };
    });
    pcs.sort(
      (left, right) =>
        (left.number ?? Number.MAX_SAFE_INTEGER) -
          (right.number ?? Number.MAX_SAFE_INTEGER) ||
        left.name.localeCompare(right.name, 'ru'),
    );

    const since = openShift?.startedAt ?? localMidnight(now, store.timeZone);
    const [adminName, revenueResult, goodsResult] = await Promise.all([
      openShift ? this.adminName(store, source.domain, openShift.userId) : null,
      this.loadRevenue(store, langame, since, now).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
      this.loadGoods(store, langame, since, openShift?.id ?? null, now).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
    ]);

    if (!revenueResult.ok) {
      this.logFailure('operations', {
        status: 'rejected',
        reason: revenueResult.error,
      });
      warnings.push('Не удалось получить выручку из Langame.');
    }
    if (!goodsResult.ok) {
      this.logFailure('product expenses', {
        status: 'rejected',
        reason: goodsResult.error,
      });
      warnings.push('Не удалось получить продажи товаров из Langame.');
    }

    const nothingRead = !catalog && !sessions && !revenueResult.ok;

    return {
      storeId: store.id,
      status: nothingRead ? 'UNAVAILABLE' : 'LIVE',
      generatedAt: now.toISOString(),
      pcs,
      guests: sessions ? guestIds.size : null,
      shift: openShift
        ? {
            adminName,
            startedAt: openShift.startedAt?.toISOString() ?? null,
          }
        : null,
      revenue: {
        period: openShift?.startedAt ? 'SHIFT' : 'TODAY',
        since: since.toISOString(),
        total: revenueResult.ok ? revenueResult.value : null,
        goods: goodsResult.ok ? goodsResult.value.total : null,
        goodsCount: goodsResult.ok ? goodsResult.value.count : null,
      },
      purchases: goodsResult.ok ? goodsResult.value.purchases : null,
      warnings,
    };
  }

  private logFailure(part: string, result: PromiseSettledResult<unknown>) {
    if (result.status !== 'rejected') return;
    const reason =
      result.reason instanceof Error ? result.reason.name : 'unknown';
    this.logger.warn(`Floor plan live read failed: ${part} (${reason})`);
  }

  private sourceForStore(
    store: LiveStore,
    sources: readonly LangameSource[],
  ): LangameSource | null {
    const byId = store.integrationSourceId
      ? sources.find((source) => source.id === store.integrationSourceId)
      : undefined;
    if (byId) return byId;
    const byDomain = store.externalDomain
      ? sources.find((source) => source.domain === store.externalDomain)
      : undefined;
    return byDomain ?? null;
  }

  private async loadPcCatalog(
    store: LiveStore,
    langame: { source: LangameSource; apiKey: string },
  ): Promise<PcCatalog> {
    const [types, links] = await Promise.all([
      this.langameClient.listPcTypesInClubs(
        langame.source.baseUrl,
        langame.apiKey,
      ),
      this.langameClient.listPcTypeLinks(
        langame.source.baseUrl,
        langame.apiKey,
      ),
    ]);

    return { pcs: this.pcsOfClub(store, types, links) };
  }

  /** Computers of this club, from the PC links of the domain. */
  pcsOfClub(
    store: Pick<LiveStore, 'externalClubId'>,
    types: readonly LangamePcTypeInClub[],
    links: readonly LangamePcTypeLink[],
  ): PcCatalog['pcs'] {
    const typeNames = new Map<string, string>();
    for (const row of types) {
      const id = text(row.id);
      const name = text(row.name);
      if (id && name) typeNames.set(id, name);
    }

    const pcs = new Map<string, PcCatalog['pcs'][number]>();
    for (const row of links) {
      const uuid = text(row.UUID ?? row.uuid)?.toUpperCase();
      if (!uuid) continue;
      const clubId = text(row.club_id ?? row.list_clubs_id);
      if (store.externalClubId && clubId && clubId !== store.externalClubId) {
        continue;
      }
      const typeId = text(row.packets_type_PC ?? row.type_id);
      pcs.set(uuid, {
        uuid,
        name: text(row.name) ?? text(row.fiscal_name) ?? uuid.slice(0, 8),
        type: typeId ? (typeNames.get(typeId) ?? null) : null,
      });
    }

    return Array.from(pcs.values());
  }

  private async loadActiveSessions(
    store: LiveStore,
    langame: { source: LangameSource; apiKey: string },
    now: Date,
  ) {
    const dateFrom = localDay(new Date(now.getTime() - DAY_MS), store.timeZone);
    const dateTo = localDay(new Date(now.getTime() + DAY_MS), store.timeZone);
    const rows: LangameGuestSession[] = [];

    for (let page = 1; page <= SESSION_PAGES; page += 1) {
      const pageRows = await this.langameClient.listGuestSessions(
        langame.source.baseUrl,
        langame.apiKey,
        { page, pageLimit: SESSION_PAGE_LIMIT, dateFrom, dateTo },
        { timeoutMs: LANGAME_TIMEOUT_MS },
      );
      rows.push(...pageRows);
      if (pageRows.length < SESSION_PAGE_LIMIT) break;
    }

    return this.activeSessions(rows, store.timeZone, now);
  }

  /** Sessions running at `now`: started and not yet stopped. */
  activeSessions(
    rows: readonly LangameGuestSession[],
    timeZone: string | null,
    now: Date,
  ) {
    const active: Array<{ uuid: string; stop: Date | null; guestKey: string }> =
      [];
    for (const row of rows) {
      const uuid = text(row.UUID)?.toUpperCase();
      const start = parseLangameDate(text(row.date_start), timeZone);
      if (!uuid || !start || start > now) continue;
      const stop = parseLangameDate(text(row.date_stop), timeZone);
      if (stop && stop <= now) continue;
      active.push({
        uuid,
        stop,
        guestKey: text(row.real_guest_id) ?? text(row.guest_id) ?? `pc:${uuid}`,
      });
    }
    return active;
  }

  private async loadOpenShift(
    store: LiveStore,
    langame: { source: LangameSource; apiKey: string },
  ) {
    const rows: LangameWorkingShift[] = [];
    // Langame ignores the date filter of shifts and returns the newest first,
    // so the first pages hold the open one.
    for (let page = 1; page <= SHIFT_PAGES; page += 1) {
      const pageRows = await this.langameClient.listWorkingShifts(
        langame.source.baseUrl,
        langame.apiKey,
        {
          page,
          pageLimit: SHIFT_PAGE_LIMIT,
          dateFrom: localDay(new Date(), store.timeZone),
          dateTo: localDay(new Date(), store.timeZone),
        },
      );
      rows.push(...pageRows);
      const found = this.openShiftOf(store, rows);
      if (found || pageRows.length < SHIFT_PAGE_LIMIT) return found;
    }
    return this.openShiftOf(store, rows);
  }

  /** The newest shift of the club that has not been closed. */
  openShiftOf(
    store: Pick<LiveStore, 'externalClubId' | 'timeZone'>,
    rows: readonly LangameWorkingShift[],
  ) {
    let best: { id: string; userId: string | null; startedAt: Date } | null =
      null;
    for (const row of rows) {
      const id = text(row.id);
      const clubId = text(row.list_clubs_id ?? row.club_id);
      if (!id) continue;
      if (store.externalClubId && clubId && clubId !== store.externalClubId) {
        continue;
      }
      if (parseLangameDate(text(row.date_stop), store.timeZone)) continue;
      const startedAt = parseLangameDate(text(row.date_start), store.timeZone);
      if (!startedAt) continue;
      if (!best || startedAt > best.startedAt) {
        best = { id, userId: text(row.user_id), startedAt };
      }
    }
    return best;
  }

  private async adminName(
    store: LiveStore,
    domain: string,
    externalUserId: string | null,
  ) {
    if (!externalUserId) return null;
    const [member, langameUser] = await Promise.all([
      this.prisma.staffMember.findFirst({
        where: {
          tenantId: store.tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalUserId,
        },
        select: { displayName: true },
      }),
      this.prisma.langameStaffUser.findFirst({
        where: {
          tenantId: store.tenantId,
          externalDomain: domain,
          externalUserId,
        },
        select: { username: true },
      }),
    ]);
    return member?.displayName ?? langameUser?.username ?? null;
  }

  private async loadRevenue(
    store: LiveStore,
    langame: { source: LangameSource; apiKey: string },
    since: Date,
    now: Date,
  ) {
    const rows = await this.langameClient.listAllOperationsLog(
      langame.source.baseUrl,
      langame.apiKey,
      {
        dateFrom: localDay(since, store.timeZone),
        dateTo: localDay(now, store.timeZone),
        ...(store.externalClubId ? { clubId: store.externalClubId } : {}),
      },
    );
    return this.revenueSince(store, rows, since);
  }

  /** Money taken by the club since `since`: the «plus» operations. */
  revenueSince(
    store: Pick<LiveStore, 'externalClubId' | 'timeZone'>,
    rows: readonly LangameOperationLog[],
    since: Date,
  ) {
    let total = 0;
    for (const row of rows) {
      if (text(row.type)?.toLowerCase() !== 'plus') continue;
      const clubId = text(row.club_id);
      if (store.externalClubId && clubId !== store.externalClubId) continue;
      const at = parseLangameDate(
        text(row.date_normal) ??
          [text(row.date), text(row.time)].filter(Boolean).join(' '),
        store.timeZone,
      );
      if (!at || at < since) continue;
      total += amount(row.sum);
    }
    return round2(total);
  }

  private async loadGoods(
    store: LiveStore,
    langame: { source: LangameSource; apiKey: string },
    since: Date,
    shiftId: string | null,
    now: Date,
  ) {
    const rows: LangameProductExpense[] = [];
    for (let page = 1; page <= EXPENSE_PAGES; page += 1) {
      const pageRows = await this.langameClient.listProductExpenses(
        langame.source.baseUrl,
        langame.apiKey,
        {
          page,
          pageLimit: EXPENSE_PAGE_LIMIT,
          dateFrom: localDay(since, store.timeZone),
          dateTo: localDay(now, store.timeZone),
        },
      );
      rows.push(...pageRows);
      if (pageRows.length < EXPENSE_PAGE_LIMIT) break;
    }
    const goods = this.goodsSince(store, rows, since, shiftId);
    const names = await this.productNames(
      store,
      langame.source.domain,
      goods.latest,
    );
    return {
      total: goods.total,
      count: goods.count,
      purchases: goods.latest.map((row) => {
        const id = text(row.list_goods_id);
        const known = id ? names.get(id) : undefined;
        const quantity = amount(row.count);
        return {
          at:
            parseLangameDate(text(row.date), store.timeZone)?.toISOString() ??
            null,
          title:
            text(row.name) ??
            text(row.goods_name) ??
            known?.name ??
            (id ? `Товар №${id}` : 'Товар'),
          category: known?.category ?? null,
          quantity: Math.round(quantity * 1000) / 1000,
          sum: round2(amount(row.price_sale) * quantity),
        };
      }),
    };
  }

  /** Names of the sold goods from the club's assortment, by Langame id. */
  private async productNames(
    store: LiveStore,
    domain: string,
    rows: readonly LangameProductExpense[],
  ) {
    const ids = [
      ...new Set(
        rows
          .map((row) => text(row.list_goods_id))
          .filter((id): id is string => id !== null),
      ),
    ];
    const names = new Map<string, { name: string; category: string | null }>();
    if (ids.length === 0) return names;
    try {
      const products = await this.prisma.product.findMany({
        where: {
          tenantId: store.tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalProductId: { in: ids },
        },
        select: {
          name: true,
          externalProductId: true,
          category: { select: { name: true } },
        },
      });
      for (const product of products) {
        if (!product.externalProductId) continue;
        names.set(product.externalProductId, {
          name: product.name,
          category: product.category?.name ?? null,
        });
      }
    } catch (error: unknown) {
      this.logFailure('product names', { status: 'rejected', reason: error });
    }
    return names;
  }

  /** Goods sold in the club since `since` (or in the open shift). */
  goodsSince(
    store: Pick<LiveStore, 'externalClubId' | 'timeZone'>,
    rows: readonly LangameProductExpense[],
    since: Date,
    shiftId: string | null,
  ) {
    let total = 0;
    let count = 0;
    const sold: Array<{ row: LangameProductExpense; at: number }> = [];
    for (const row of rows) {
      if (truthy(row.cancel)) continue;
      const clubId = text(row.list_clubs_id);
      if (store.externalClubId && clubId !== store.externalClubId) continue;
      const rowShift = text(row.working_shift_id);
      if (shiftId && rowShift) {
        if (rowShift !== shiftId) continue;
      } else {
        const at = parseLangameDate(text(row.date), store.timeZone);
        if (!at || at < since) continue;
      }
      const quantity = amount(row.count);
      total += amount(row.price_sale) * quantity;
      count += quantity;
      sold.push({
        row,
        at: parseLangameDate(text(row.date), store.timeZone)?.getTime() ?? 0,
      });
    }
    sold.sort(
      (left, right) =>
        right.at - left.at || amount(right.row.id) - amount(left.row.id),
    );
    return {
      total: round2(total),
      count: Math.round(count),
      latest: sold.slice(0, PURCHASES_SHOWN).map((entry) => entry.row),
    };
  }
}

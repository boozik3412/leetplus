import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import { GuestsService } from '../guests/guests.service';
import { parseLangameDate } from '../integrations/langame-date';
import { LangameClient } from '../integrations/langame.client';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type {
  LangameGuestSession,
  LangameOperationLog,
  LangamePcTypeInClub,
  LangamePcTypeLink,
  LangameProductExpense,
  LangameTariffTypeGroup,
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

/** A game mechanic running for the club's guests right now. */
export type StoreFloorPlanLiveGameItem = {
  kind: 'MISSION' | 'CASE' | 'PROMO';
  title: string;
  reward: string | null;
  xp: number | null;
  endsAt: string | null;
  /** Offered to one guest segment, not to every guest. */
  segment: boolean;
};

export type StoreFloorPlanLiveGame = {
  /** Rewards guests of this club got in the shift (or today). */
  completed: { missions: number; cases: number; rewards: number };
  season: { name: string; endsAt: string | null; levels: number | null } | null;
  items: StoreFloorPlanLiveGameItem[];
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
  /**
   * What the LeetPlus game module runs for this club now: active missions,
   * cases, promo cards and the season, without guests or their progress.
   * `null` when it could not be read.
   */
  game: StoreFloorPlanLiveGame | null;
  warnings: string[];
};

/** The guest at a busy computer, for roles that see the «Гости» section. */
export type StoreFloorPlanSeatGuest = {
  id: string;
  displayName: string;
  isStaff: boolean;
  segment: string;
  rfmSegment: string;
  crmStatus: string;
  crmNote: string | null;
  nextAction: string | null;
  /** First seen in Langame. */
  since: string | null;
  visitsDays: number;
  playHours: number;
  totalRevenue: number;
  previousVisit: { at: string; storeName: string | null } | null;
  balance: number | null;
  bonusBalance: number | null;
  recommendedAction: { key: string; label: string; reason: string } | null;
  /** What this guest bought at this club in the shift (or today). */
  purchases: StoreFloorPlanLivePurchase[];
  gameAccess: 'AVAILABLE' | 'NO_CAPABILITY';
  game: {
    level: number;
    xp: number;
    xpToNextLevel: number;
    pendingRewards: number;
    rewardsExpiringSoon: number;
    nearestRewardExpiresAt: string | null;
    rewardsPaidTotal: number;
  } | null;
};

/** One computer of the floor plan with its current session. */
export type StoreFloorPlanSeatView = {
  storeId: string;
  number: number;
  busy: boolean;
  session: {
    startedAt: string;
    endsAt: string | null;
    /** Langame tariff (package) name, when the session runs on one. */
    tariff: string | null;
  } | null;
  /** NO_CAPABILITY: the viewer does not see the «Гости» section. */
  guestAccess: 'AVAILABLE' | 'NO_CAPABILITY';
  /** `null` also when the guest is not loaded from Langame yet. */
  guest: StoreFloorPlanSeatGuest | null;
  /**
   * A guest of the session who is not in the LeetPlus guest base yet: the
   * guest directory is read from Langame once a night, so guests registered
   * since then have no card. Name straight from Langame (`null` if Langame
   * did not answer) and the shift purchases of the club.
   */
  newGuest: {
    displayName: string | null;
    purchases: StoreFloorPlanLivePurchase[];
  } | null;
};

/** Busy computers and their Langame guests; internal to the API. */
export type StoreFloorPlanSeatedGuests = {
  storeId: string;
  tenantId: string;
  timeZone: string | null;
  domain: string | null;
  seats: Array<{
    number: number;
    langameGuestId: string | null;
    startedAt: Date;
    endsAt: Date | null;
    /** Lines the guest bought at the bar this shift; null if unknown. */
    purchases: number | null;
  }>;
};

type LiveSeat = {
  guestId: string | null;
  startedAt: Date;
  stop: Date | null;
  packet: string | null;
};

/** The club view plus what a click on one computer needs, never sent whole. */
type LiveSnapshot = {
  view: StoreFloorPlanLiveView;
  domain: string | null;
  seats: Map<number, LiveSeat>;
  purchasesByGuest: Map<string, LangameProductExpense[]>;
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
const GUEST_PURCHASES_SHOWN = 10;
/** Tariff names change rarely. */
const TARIFF_TTL_MS = 10 * 60_000;
const NEW_GUEST_NAME_TTL_MS = 10 * 60_000;
const GAME_ITEMS_SHOWN = 30;
/** Rewards that really went to a guest (not cancelled or expired). */
const COUNTED_REWARD_STATUSES = ['PENDING', 'APPROVED', 'PAID'];
/** Cases a guest can get directly; templates are only handed out by missions. */
const GUEST_CASE_USAGE = ['STANDALONE', 'BOTH'];
const DAY_MS = 24 * 60 * 60_000;
const GAME_WARNING = 'Не удалось получить активности игрового модуля.';

/** An empty club list means the mechanic runs in every club. */
function forStore(storeIds: Prisma.JsonValue | null, storeId: string) {
  if (!Array.isArray(storeIds) || storeIds.length === 0) return true;
  return storeIds.includes(storeId);
}

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
  private readonly snapshots = new Map<string, CacheEntry<LiveSnapshot>>();
  private readonly catalogs = new Map<string, CacheEntry<PcCatalog>>();
  private readonly tariffs = new Map<string, CacheEntry<Map<string, string>>>();
  private readonly newGuestNames = new Map<string, CacheEntry<string | null>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly freshStoreScopeService: FreshStoreScopeService,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameClient: LangameClient,
    private readonly guestsService: GuestsService,
  ) {}

  async get(
    storeId: string,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<StoreFloorPlanLiveView> {
    const { snapshot } = await this.snapshot(storeId, user, now);
    return snapshot.view;
  }

  /**
   * Busy computers of the club with the Langame guest of each session, from
   * the same shared 15-second Langame read as the club view. For the hints of
   * «Схема клуба»; the Langame guest ids never leave the API.
   */
  async seatedGuests(
    storeId: string,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<StoreFloorPlanSeatedGuests> {
    const { store, snapshot } = await this.snapshot(storeId, user, now);
    return {
      storeId: store.id,
      tenantId: store.tenantId,
      timeZone: store.timeZone,
      domain: snapshot.domain,
      seats: Array.from(snapshot.seats, ([number, seat]) => ({
        number,
        langameGuestId: seat.guestId,
        startedAt: seat.startedAt,
        endsAt: seat.stop,
        purchases:
          snapshot.view.purchases === null || !seat.guestId
            ? null
            : (snapshot.purchasesByGuest.get(seat.guestId)?.length ?? 0),
      })).sort((first, second) => first.number - second.number),
    };
  }

  /**
   * One computer of the club: its session and, for roles that see the
   * «Гости» section, the guest at it. The session comes from the same shared
   * Langame read as the club view; the guest is read from the LeetPlus guest
   * card by the Langame guest id of the session.
   */
  async getSeat(
    storeId: string,
    number: number,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<StoreFloorPlanSeatView> {
    const { store, snapshot } = await this.snapshot(storeId, user, now);
    const seat = snapshot.seats.get(number) ?? null;
    const guestAccess = canViewGuests(user) ? 'AVAILABLE' : 'NO_CAPABILITY';
    const result: StoreFloorPlanSeatView = {
      storeId: store.id,
      number,
      busy: seat !== null,
      session: null,
      guestAccess,
      guest: null,
      newGuest: null,
    };
    if (!seat) return result;

    const [tariff, guest] = await Promise.all([
      this.tariffName(store, snapshot.domain, seat.packet, now),
      guestAccess === 'AVAILABLE' && seat.guestId && snapshot.domain
        ? this.seatGuest(store, snapshot, seat, seat.guestId, user)
        : null,
    ]);
    result.session = {
      startedAt: seat.startedAt.toISOString(),
      endsAt: seat.stop ? seat.stop.toISOString() : null,
      tariff,
    };
    result.guest = guest;
    if (
      !guest &&
      guestAccess === 'AVAILABLE' &&
      seat.guestId &&
      snapshot.domain
    ) {
      result.newGuest = await this.newSeatGuest(
        store,
        snapshot,
        seat.guestId,
        now,
      );
    }
    return result;
  }

  /** The guest of a session who has no LeetPlus card yet (see `newGuest`). */
  private async newSeatGuest(
    store: LiveStore,
    snapshot: LiveSnapshot,
    langameGuestId: string,
    now: Date,
  ): Promise<StoreFloorPlanSeatView['newGuest']> {
    const domain = snapshot.domain ?? '';
    const rows = snapshot.purchasesByGuest.get(langameGuestId) ?? [];
    const shown = rows.slice(0, GUEST_PURCHASES_SHOWN);
    const [displayName, names] = await Promise.all([
      this.langameGuestName(store, domain, langameGuestId, now),
      this.productNames(store, domain, shown),
    ]);
    return {
      displayName,
      purchases: shown.map((row) => this.purchase(store, row, names)),
    };
  }

  /** Guest name from the Langame guest card; `null` if unknown. */
  private async langameGuestName(
    store: LiveStore,
    domain: string,
    langameGuestId: string,
    now: Date,
  ) {
    try {
      return await this.cached(
        this.newGuestNames,
        `${store.tenantId}:${domain}:${langameGuestId}`,
        NEW_GUEST_NAME_TTL_MS,
        now,
        async () => {
          const access = await this.langameSettingsService.resolveTenantAccess(
            store.tenantId,
          );
          const source = access.sources.find((item) => item.domain === domain);
          if (!source) return null;
          const payload: unknown =
            await this.langameClient.getDiagnosticEndpoint(
              source.baseUrl,
              access.apiKey,
              `/guests/${encodeURIComponent(langameGuestId)}`,
            );
          return langameGuestFio(payload);
        },
      );
    } catch (error: unknown) {
      this.logFailure('guest', { status: 'rejected', reason: error });
      return null;
    }
  }

  private async snapshot(
    storeId: string,
    user: AuthenticatedUser,
    now: Date,
  ): Promise<{ store: LiveStore; snapshot: LiveSnapshot }> {
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
    const snapshot = await this.cached(
      this.snapshots,
      key,
      SNAPSHOT_TTL_MS,
      now,
      () => this.buildSnapshot(store, now),
    );
    return { store, snapshot };
  }

  private async seatGuest(
    store: LiveStore,
    snapshot: LiveSnapshot,
    seat: LiveSeat,
    langameGuestId: string,
    user: AuthenticatedUser,
  ): Promise<StoreFloorPlanSeatGuest | null> {
    const found = await this.prisma.guest.findFirst({
      where: {
        tenantId: store.tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: snapshot.domain,
        externalGuestId: langameGuestId,
      },
      select: { id: true, isStaff: true },
    });
    if (!found) return null;

    const detail = await this.guestsService.getGuest(user, found.id);
    const sessionStart = seat.startedAt.getTime();
    const previous = detail.sessions.find((session) => {
      const at = session.startedAt ? Date.parse(session.startedAt) : NaN;
      // The running session may already be synced: skip it.
      return Number.isFinite(at) && at < sessionStart - 60_000;
    });
    const money = detail.transactions.find(
      (row) => row.balance !== null || row.bonusBalance !== null,
    );
    const rows = snapshot.purchasesByGuest.get(langameGuestId) ?? [];
    const shown = rows.slice(0, GUEST_PURCHASES_SHOWN);
    const names = await this.productNames(store, snapshot.domain ?? '', shown);
    const profile = detail.gamification?.profile ?? detail.gameProfile ?? null;

    return {
      id: detail.id,
      displayName: detail.displayName,
      isStaff: found.isStaff,
      segment: detail.segment,
      rfmSegment: detail.rfm.segment,
      crmStatus: detail.crmStatus,
      crmNote: detail.crmNote,
      nextAction: detail.nextAction,
      since: detail.insertedAt,
      visitsDays: detail.visitsDays,
      playHours: detail.playHours,
      totalRevenue: detail.ltv.totalRevenue,
      previousVisit: previous?.startedAt
        ? { at: previous.startedAt, storeName: previous.storeName }
        : null,
      balance: money?.balance ?? null,
      bonusBalance: money?.bonusBalance ?? null,
      recommendedAction:
        detail.recommendedAction.key === 'OBSERVE' ||
        !detail.recommendedAction.label
          ? null
          : {
              key: detail.recommendedAction.key,
              label: detail.recommendedAction.label,
              reason: detail.recommendedAction.reason,
            },
      purchases: shown.map((row) => this.purchase(store, row, names)),
      gameAccess: detail.gameAccess,
      game: profile
        ? {
            level: profile.level,
            xp: profile.xp,
            xpToNextLevel: profile.xpToNextLevel,
            pendingRewards: profile.pendingRewards,
            rewardsExpiringSoon: profile.rewardsExpiringSoon,
            nearestRewardExpiresAt: profile.nearestRewardExpiresAt,
            rewardsPaidTotal: profile.rewardsPaidTotal,
          }
        : null,
    };
  }

  /** Name of the Langame tariff a session runs on; `null` if unknown. */
  private async tariffName(
    store: LiveStore,
    domain: string | null,
    packet: string | null,
    now: Date,
  ) {
    if (!packet || !domain) return null;
    try {
      const access = await this.langameSettingsService.resolveTenantAccess(
        store.tenantId,
      );
      const source = access.sources.find((item) => item.domain === domain);
      if (!source) return null;
      const names = await this.cached(
        this.tariffs,
        `${store.tenantId}:${domain}`,
        TARIFF_TTL_MS,
        now,
        async () => {
          const rows: LangameTariffTypeGroup[] =
            await this.langameClient.listTariffTypeGroups(
              source.baseUrl,
              access.apiKey,
            );
          const map = new Map<string, string>();
          for (const row of rows) {
            const id = text(row.id);
            const name = text(row.name);
            if (id && name) map.set(id, name);
          }
          return map;
        },
      );
      return names.get(packet) ?? null;
    } catch (error: unknown) {
      this.logFailure('tariffs', { status: 'rejected', reason: error });
      return null;
    }
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
      game: null,
      warnings: [warning],
    };
  }

  /** A club without Langame still shows what the game module runs there. */
  private async withGame(
    store: LiveStore,
    now: Date,
    view: StoreFloorPlanLiveView,
  ): Promise<LiveSnapshot> {
    const game = await this.loadGame(
      store,
      localMidnight(now, store.timeZone),
      now,
    );
    return {
      view: game.ok
        ? { ...view, game: game.value }
        : { ...view, warnings: [...view.warnings, GAME_WARNING] },
      domain: null,
      seats: new Map(),
      purchasesByGuest: new Map(),
    };
  }

  private async buildSnapshot(
    store: LiveStore,
    now: Date,
  ): Promise<LiveSnapshot> {
    if (store.externalProvider !== IntegrationProvider.LANGAME) {
      return this.withGame(
        store,
        now,
        this.empty(
          store,
          now,
          'NOT_CONNECTED',
          'Клуб не подключён к Langame, на схеме нет живых данных.',
        ),
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
      return this.withGame(
        store,
        now,
        this.empty(
          store,
          now,
          'NOT_CONNECTED',
          'Подключение к Langame не настроено.',
        ),
      );
    }

    if (!source) {
      return this.withGame(
        store,
        now,
        this.empty(
          store,
          now,
          'NOT_CONNECTED',
          'Для клуба не найден активный домен Langame.',
        ),
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
    const latestByUuid = new Map<string, LiveSeat>();
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
      const latest = latestByUuid.get(session.uuid);
      if (!latest || session.start > latest.startedAt) {
        latestByUuid.set(session.uuid, {
          guestId: session.guestId,
          startedAt: session.start,
          stop: session.stop,
          packet: session.packet,
        });
      }
      guestIds.add(session.guestKey);
    }
    const seats = new Map<number, LiveSeat>();
    for (const pc of catalog?.pcs ?? []) {
      const seat = latestByUuid.get(pc.uuid);
      const number = seatNumberFromName(pc.name);
      if (seat && number !== null && !seats.has(number)) {
        seats.set(number, seat);
      }
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
    const [adminName, revenueResult, goodsResult, gameResult] =
      await Promise.all([
        openShift
          ? this.adminName(store, source.domain, openShift.userId)
          : null,
        this.loadRevenue(store, langame, since, now).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        ),
        this.loadGoods(store, langame, since, openShift?.id ?? null, now).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        ),
        this.loadGame(store, since, now),
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
    if (!gameResult.ok) warnings.push(GAME_WARNING);

    const nothingRead = !catalog && !sessions && !revenueResult.ok;

    const view: StoreFloorPlanLiveView = {
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
      game: gameResult.ok ? gameResult.value : null,
      warnings,
    };
    return {
      view,
      domain: source.domain,
      seats,
      purchasesByGuest: goodsResult.ok
        ? goodsResult.value.byGuest
        : new Map<string, LangameProductExpense[]>(),
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
    const active: Array<{
      uuid: string;
      start: Date;
      stop: Date | null;
      guestKey: string;
      guestId: string | null;
      packet: string | null;
    }> = [];
    for (const row of rows) {
      const uuid = text(row.UUID)?.toUpperCase();
      const start = parseLangameDate(text(row.date_start), timeZone);
      if (!uuid || !start || start > now) continue;
      const stop = parseLangameDate(text(row.date_stop), timeZone);
      if (stop && stop <= now) continue;
      const guestId = text(row.real_guest_id) ?? text(row.guest_id);
      const packet = text(row.packet);
      active.push({
        uuid,
        start,
        stop,
        guestKey: guestId ?? `pc:${uuid}`,
        guestId,
        packet: packet && packet !== '0' ? packet : null,
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
      purchases: goods.latest.map((row) => this.purchase(store, row, names)),
      byGuest: goods.byGuest,
    };
  }

  private purchase(
    store: Pick<LiveStore, 'timeZone'>,
    row: LangameProductExpense,
    names: Map<string, { name: string; category: string | null }>,
  ): StoreFloorPlanLivePurchase {
    const id = text(row.list_goods_id);
    const known = id ? names.get(id) : undefined;
    const quantity = amount(row.count);
    return {
      at:
        parseLangameDate(text(row.date), store.timeZone)?.toISOString() ?? null,
      title:
        text(row.name) ??
        text(row.goods_name) ??
        known?.name ??
        (id ? `Товар №${id}` : 'Товар'),
      category: known?.category ?? null,
      quantity: Math.round(quantity * 1000) / 1000,
      sum: round2(amount(row.price_sale) * quantity),
    };
  }

  /** Names of the sold goods from the club's assortment, by Langame id. */
  /** Game mechanics of the club and what its guests got since `since`. */
  private async loadGame(
    store: LiveStore,
    since: Date,
    now: Date,
  ): Promise<{ ok: true; value: StoreFloorPlanLiveGame } | { ok: false }> {
    const tenantId = store.tenantId;
    const running = {
      AND: [
        { OR: [{ periodFrom: null }, { periodFrom: { lte: now } }] },
        { OR: [{ periodTo: null }, { periodTo: { gte: now } }] },
      ],
    };
    const rewardsSince = (extra: Prisma.GuestGameRewardWhereInput) =>
      this.prisma.guestGameReward.count({
        where: {
          tenantId,
          storeId: store.id,
          status: { in: COUNTED_REWARD_STATUSES },
          qualifiedAt: { gte: since, lte: now },
          ...extra,
        },
      });
    try {
      const [
        missions,
        cases,
        seasons,
        promos,
        missionRewards,
        caseRewards,
        rewards,
      ] = await Promise.all([
        this.prisma.guestGameMission.findMany({
          where: { tenantId, status: 'ACTIVE', ...running },
          select: {
            name: true,
            rewardLabel: true,
            xpReward: true,
            periodTo: true,
            storeIds: true,
            audienceId: true,
          },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.guestGameLootBox.findMany({
          where: {
            tenantId,
            status: 'ACTIVE',
            usageKind: { in: GUEST_CASE_USAGE },
          },
          select: {
            name: true,
            rewardLabel: true,
            storeIds: true,
            audienceId: true,
          },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.guestGameSeason.findMany({
          where: { tenantId, status: 'ACTIVE', ...running },
          select: { name: true, periodTo: true, levels: true, storeIds: true },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.guestGamePromoCard.findMany({
          where: { tenantId, status: 'ACTIVE', ...running },
          select: { title: true, label: true, periodTo: true, storeIds: true },
          orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        }),
        rewardsSince({ missionId: { not: null } }),
        rewardsSince({ lootBoxId: { not: null } }),
        rewardsSince({}),
      ]);

      const here = (storeIds: Prisma.JsonValue | null) =>
        forStore(storeIds, store.id);
      const items: StoreFloorPlanLiveGameItem[] = [
        ...missions
          .filter((mission) => here(mission.storeIds))
          .map(
            (mission): StoreFloorPlanLiveGameItem => ({
              kind: 'MISSION',
              title: mission.name,
              reward: text(mission.rewardLabel),
              xp: mission.xpReward > 0 ? mission.xpReward : null,
              endsAt: mission.periodTo?.toISOString() ?? null,
              segment: mission.audienceId !== null,
            }),
          ),
        ...cases
          .filter((lootBox) => here(lootBox.storeIds))
          .map(
            (lootBox): StoreFloorPlanLiveGameItem => ({
              kind: 'CASE',
              title: lootBox.name,
              reward: text(lootBox.rewardLabel),
              xp: null,
              endsAt: null,
              segment: lootBox.audienceId !== null,
            }),
          ),
        ...promos
          .filter((promo) => here(promo.storeIds))
          .map(
            (promo): StoreFloorPlanLiveGameItem => ({
              kind: 'PROMO',
              title: promo.title,
              reward: text(promo.label),
              xp: null,
              endsAt: promo.periodTo?.toISOString() ?? null,
              segment: false,
            }),
          ),
      ];
      const season =
        seasons
          .filter((entry) => here(entry.storeIds))
          .sort(
            (left, right) =>
              (left.periodTo?.getTime() ?? Number.MAX_SAFE_INTEGER) -
              (right.periodTo?.getTime() ?? Number.MAX_SAFE_INTEGER),
          )[0] ?? null;

      return {
        ok: true,
        value: {
          completed: {
            missions: missionRewards,
            cases: caseRewards,
            rewards,
          },
          season: season
            ? {
                name: season.name,
                endsAt: season.periodTo?.toISOString() ?? null,
                levels: Array.isArray(season.levels)
                  ? season.levels.length
                  : null,
              }
            : null,
          items: items.slice(0, GAME_ITEMS_SHOWN),
        },
      };
    } catch (error: unknown) {
      this.logFailure('game module', { status: 'rejected', reason: error });
      return { ok: false };
    }
  }

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
    const byGuest = new Map<string, LangameProductExpense[]>();
    for (const { row } of sold) {
      const guestId = text(row.real_guest_id) ?? text(row.guest_id);
      if (!guestId) continue;
      const list = byGuest.get(guestId);
      if (list) list.push(row);
      else byGuest.set(guestId, [row]);
    }
    return {
      total: round2(total),
      count: Math.round(count),
      latest: sold.slice(0, PURCHASES_SHOWN).map((entry) => entry.row),
      byGuest,
    };
  }
}

/** `fio` of the Langame `/guests/{id}` answer (`data` is a row or a list). */
function langameGuestFio(payload: unknown): string | null {
  const data =
    payload && typeof payload === 'object' && 'data' in payload
      ? payload.data
      : payload;
  const row: unknown = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const fio = text((row as Record<string, unknown>).fio);
  return fio ? fio.replace(/\s+/g, ' ').slice(0, 120) : null;
}

/** Same rule as the «Гости» section: the guest card is `view_guests`. */
function canViewGuests(user: AuthenticatedUser) {
  return (
    user.isPlatformAdmin ||
    user.role === 'OWNER' ||
    hasCapability(user, 'view_guests')
  );
}

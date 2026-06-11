import { BadRequestException, Injectable } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LangameClient } from '../integrations/langame.client';
import { parseLangameDate as parseLangameDateValue } from '../integrations/langame-date';
import { LangameSettingsService } from '../integrations/langame-settings.service';
import type {
  LangameProductExpense,
  LangameWorkingShift,
} from '../integrations/langame.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  STAFF_CHAT_REPORTING_CHANNEL_DESCRIPTION,
  STAFF_CHAT_REPORTING_CHANNEL_NAME,
} from './staff-team-chat.service';

const SHIFT_REPORT_ATTACHMENT_LIMIT = 20;
const SHIFT_REPORT_LANGAME_PAGE_LIMIT = 100;
const SHIFT_REPORT_RECENT_WINDOW_HOURS = 96;

export type StaffShiftReportAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  url: string;
  createdAt: string;
};

export type StaffShiftReportProductGroup = {
  quantity: number;
  revenue: number;
};

export type StaffShiftReportFinancials = {
  sourceWindowStartedAt: string | null;
  sourceWindowStoppedAt: string | null;
  cashAmount: number | null;
  cashlessAmount: number | null;
  mobilePay: number | null;
  yandexPay: number | null;
  refundsAmount: number | null;
  incassAmount: number | null;
  shiftCashTotal: number | null;
  productRevenue: number | null;
  productSalesCount: number;
  hookahs: StaffShiftReportProductGroup;
  devices: StaffShiftReportProductGroup;
  merch: StaffShiftReportProductGroup;
  sourceNotes: string[];
};

export type StaffShiftReportShiftOption = {
  id: string;
  externalUserId: string | null;
  operatorName: string;
  storeName: string;
  startedAt: string | null;
  stoppedAt: string | null;
  status: 'OPEN' | 'CLOSED';
  isSelected: boolean;
};

export type StaffShiftReportDraft = {
  generatedAt: string;
  storeId: string | null;
  selectedShiftId: string | null;
  clubName: string;
  dateLabel: string;
  dayPartLabel: string;
  administratorName: string;
  shiftStartedAt: string | null;
  shiftStoppedAt: string | null;
  checklists: Array<{
    id: string;
    title: string;
    status: string;
    requiredItemsDone: number;
    requiredItemsTotal: number;
    evidenceDone: number;
    evidenceTotal: number;
    submittedAt: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    completedAt: string | null;
  }>;
  attachments: StaffShiftReportAttachment[];
  shiftOptions: StaffShiftReportShiftOption[];
  syncWarnings: string[];
  financials: StaffShiftReportFinancials;
  missingData: string[];
  body: string;
};

export type StaffShiftReportDraftQuery = {
  shiftId?: string | null;
};

export type StaffShiftReportSendDto = {
  body?: string | null;
  storeId?: string | null;
  attachmentIds?: string[] | null;
};

export type StaffShiftReportSendResult = {
  channelId: string;
  messageId: string;
  chatHref: string;
};

type ShiftReportActiveShift = Prisma.GuestWorkingShiftGetPayload<{
  include: { store: { select: { id: true; name: true } } };
}>;

type ShiftReportStore = {
  id: string;
  name: string;
  timeZone: string | null;
  externalDomain: string | null;
  externalClubId: string | null;
  integrationSourceId: string | null;
};

type ShiftReportSource = {
  id: string;
  domain: string;
  baseUrl: string;
};

type ShiftReportSalesFact = Prisma.SalesFactGetPayload<{
  select: {
    revenue: true;
    quantity: true;
    productNameAtSale: true;
    externalProductId: true;
    productId: true;
  };
}> & {
  productName: string | null;
  categoryName: string | null;
};

@Injectable()
export class StaffShiftReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly langameSettingsService: LangameSettingsService,
    private readonly langameClient: LangameClient,
  ) {}

  async getDraft(
    user: AuthenticatedUser,
    query: StaffShiftReportDraftQuery = {},
  ): Promise<StaffShiftReportDraft> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const now = new Date();
    const requestedShiftId = this.normalizeOptionalString(query.shiftId);
    const member = await this.prisma.staffMember.findFirst({
      where: { tenantId, userId: user.id },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            timeZone: true,
            externalDomain: true,
            externalClubId: true,
            integrationSourceId: true,
          },
        },
      },
    });
    const storeId = member?.storeId ?? null;
    const timeZone = member?.store?.timeZone ?? 'Asia/Yekaterinburg';
    const requestedShift = requestedShiftId
      ? await this.findShiftById(tenantId, requestedShiftId, storeId)
      : null;
    const syncWarnings = await this.syncReportDataFromLangame(
      tenantId,
      member?.store ?? null,
      requestedShift,
      now,
    );
    let activeShift = await this.findReportShift(
      tenantId,
      storeId,
      member?.externalUserId ?? null,
      requestedShiftId,
      now,
    );

    if (activeShift) {
      syncWarnings.push(
        ...(await this.syncShiftProductSalesFromLangame(
          tenantId,
          activeShift,
          now,
        )),
      );
      activeShift = await this.findShiftById(tenantId, activeShift.id, storeId);
    }

    const reportStoreId = activeShift?.storeId ?? storeId;
    const shiftOptions = await this.findShiftOptions(
      tenantId,
      reportStoreId,
      activeShift?.id ?? requestedShiftId ?? null,
      now,
    );
    const since =
      activeShift?.startedAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const checklists = await this.findChecklistRuns(
      tenantId,
      user.id,
      reportStoreId,
      since,
    );
    const tasks = await this.findCompletedTasks(
      tenantId,
      user.id,
      reportStoreId,
      since,
    );
    const financials = await this.resolveFinancials(
      tenantId,
      reportStoreId,
      activeShift,
      now,
    );
    const attachments = this.collectChecklistAttachments(checklists);
    const clubName =
      activeShift?.store?.name ?? member?.store?.name ?? 'Клуб не указан';
    const administratorName =
      member?.displayName ?? user.fullName ?? user.email ?? 'Администратор';
    const dateLabel = this.formatDate(now, timeZone);
    const dayPartLabel = this.resolveDayPart(now, timeZone);
    const missingData = this.resolveMissingData(financials);

    return {
      generatedAt: now.toISOString(),
      storeId: reportStoreId,
      selectedShiftId: activeShift?.id ?? null,
      clubName,
      dateLabel,
      dayPartLabel,
      administratorName,
      shiftStartedAt: activeShift?.startedAt?.toISOString() ?? null,
      shiftStoppedAt: activeShift?.stoppedAt?.toISOString() ?? null,
      checklists: checklists.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        requiredItemsDone: row.requiredItemsDone,
        requiredItemsTotal: row.requiredItemsTotal,
        evidenceDone: row.evidenceDone,
        evidenceTotal: row.evidenceTotal,
        submittedAt: row.submittedAt?.toISOString() ?? null,
      })),
      tasks: tasks.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        completedAt: row.completedAt?.toISOString() ?? null,
      })),
      attachments,
      shiftOptions,
      syncWarnings,
      financials,
      missingData,
      body: this.buildDraftBody({
        clubName,
        dateLabel,
        dayPartLabel,
        administratorName,
        checklists,
        tasks,
        attachments,
        financials,
      }),
    };
  }

  async sendReport(
    user: AuthenticatedUser,
    dto: StaffShiftReportSendDto,
  ): Promise<StaffShiftReportSendResult> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const body = this.normalizeRequiredString(dto.body, 'Report body', 12000);
    const attachmentIds = await this.resolveAttachmentIds(
      tenantId,
      user.id,
      dto.attachmentIds,
    );
    const storeId = await this.resolveStoreId(tenantId, dto.storeId);
    const channel = await this.ensureReportingChannel(tenantId);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staffChatMessage.create({
        data: {
          tenantId,
          channelId: channel.id,
          authorUserId: user.id,
          storeId,
          body,
          kind: 'ANNOUNCEMENT',
          priority: 'NORMAL',
          isPinned: false,
        },
        select: { id: true },
      });

      if (attachmentIds.length > 0) {
        await tx.staffChatMessageAttachment.createMany({
          data: attachmentIds.map((attachmentId) => ({
            tenantId,
            messageId: created.id,
            attachmentId,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    return {
      channelId: channel.id,
      messageId: message.id,
      chatHref: `/staff/team-chat?channelId=${encodeURIComponent(channel.id)}`,
    };
  }

  private async findShiftById(
    tenantId: string,
    shiftId: string,
    storeId: string | null,
  ) {
    const scopedShift = await this.prisma.guestWorkingShift.findFirst({
      where: {
        id: shiftId,
        tenantId,
        ...(storeId ? { storeId } : {}),
      },
      include: { store: { select: { id: true, name: true } } },
    });

    if (scopedShift || !storeId) {
      return scopedShift;
    }

    return this.prisma.guestWorkingShift.findFirst({
      where: {
        id: shiftId,
        tenantId,
      },
      include: { store: { select: { id: true, name: true } } },
    });
  }

  private async findReportShift(
    tenantId: string,
    storeId: string | null,
    externalUserId: string | null,
    requestedShiftId: string | null,
    now: Date,
  ) {
    if (requestedShiftId) {
      return this.findShiftById(tenantId, requestedShiftId, storeId);
    }

    if (!externalUserId) {
      return null;
    }

    const openShift = await this.prisma.guestWorkingShift.findFirst({
      where: {
        tenantId,
        externalUserId,
        ...(storeId ? { storeId } : {}),
        stoppedAt: null,
      },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ startedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    if (openShift) {
      return openShift;
    }

    const recentSince = new Date(
      now.getTime() - SHIFT_REPORT_RECENT_WINDOW_HOURS * 60 * 60 * 1000,
    );

    return this.prisma.guestWorkingShift.findFirst({
      where: {
        tenantId,
        externalUserId,
        ...(storeId ? { storeId } : {}),
        stoppedAt: { not: null },
        OR: [
          { startedAt: { gte: recentSince } },
          { stoppedAt: { gte: recentSince } },
        ],
      },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [
        { stoppedAt: 'desc' },
        { startedAt: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  private async syncReportDataFromLangame(
    tenantId: string,
    store: ShiftReportStore | null,
    requestedShift: ShiftReportActiveShift | null,
    now: Date,
  ) {
    const warnings: string[] = [];

    if (!store) {
      return warnings;
    }

    try {
      const { apiKey, sources } =
        await this.langameSettingsService.resolveTenantAccess(tenantId);
      const matchedSources = this.langameSourcesForStore(store, sources);

      if (matchedSources.length === 0) {
        return ['Для клуба не найден активный Langame-источник.'];
      }

      const syncWindow = this.resolveShiftSyncWindow(requestedShift, now);

      for (const source of matchedSources) {
        try {
          await this.syncWorkingShiftsFromSource(
            tenantId,
            store,
            source,
            apiKey,
            syncWindow,
          );
        } catch (error) {
          warnings.push(
            `${source.domain}: ${
              error instanceof Error
                ? error.message
                : 'не удалось обновить смены Langame'
            }`,
          );
        }
      }
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : 'Langame API временно недоступен',
      );
    }

    return warnings;
  }

  private resolveShiftSyncWindow(
    requestedShift: ShiftReportActiveShift | null,
    now: Date,
  ) {
    const fromBase =
      requestedShift?.startedAt ??
      new Date(
        now.getTime() - SHIFT_REPORT_RECENT_WINDOW_HOURS * 60 * 60 * 1000,
      );
    const toBase = requestedShift?.stoppedAt ?? now;

    return {
      dateFrom: this.toDateInputValue(
        new Date(fromBase.getTime() - 12 * 60 * 60 * 1000),
      ),
      dateTo: this.toDateInputValue(
        new Date(toBase.getTime() + 12 * 60 * 60 * 1000),
      ),
    };
  }

  private async syncWorkingShiftsFromSource(
    tenantId: string,
    store: ShiftReportStore,
    source: ShiftReportSource,
    apiKey: string,
    window: { dateFrom: string; dateTo: string },
  ) {
    for (let page = 1; page <= 5; page += 1) {
      const rows = await this.langameClient.listWorkingShifts(
        source.baseUrl,
        apiKey,
        {
          page,
          pageLimit: SHIFT_REPORT_LANGAME_PAGE_LIMIT,
          dateFrom: window.dateFrom,
          dateTo: window.dateTo,
        },
      );

      for (const row of rows) {
        await this.upsertWorkingShiftFromLangameRow(
          tenantId,
          store,
          source.domain,
          row,
        );
      }

      if (rows.length < SHIFT_REPORT_LANGAME_PAGE_LIMIT) {
        break;
      }
    }
  }

  private async upsertWorkingShiftFromLangameRow(
    tenantId: string,
    store: ShiftReportStore,
    domain: string,
    row: LangameWorkingShift,
  ) {
    const externalShiftId = this.toNullableString(row.id);
    const externalUserId = this.toNullableString(row.user_id);
    const externalClubId = this.toNullableString(row.list_clubs_id);

    if (!externalShiftId) {
      return;
    }

    if (
      store.externalClubId &&
      externalClubId &&
      externalClubId !== store.externalClubId
    ) {
      return;
    }

    const startedAt = this.parseLangameDate(
      this.toNullableString(row.date_start),
      store.timeZone,
    );
    const stoppedAt = this.parseLangameDate(
      this.toNullableString(row.date_stop),
      store.timeZone,
    );

    await this.prisma.guestWorkingShift.upsert({
      where: {
        tenantId_externalProvider_externalDomain_externalShiftId: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalShiftId,
        },
      },
      create: {
        tenantId,
        storeId: store.id,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
        externalShiftId,
        externalUserId,
        externalClubId,
        startedAt,
        stoppedAt,
        durationMinutes: this.durationMinutes(startedAt, stoppedAt),
        cashStart: this.toDecimalOrNull(row.start),
        cashAmount: this.toDecimalOrNull(row.nal),
        cashlessAmount: this.toDecimalOrNull(row.beznal),
        refundsCash: this.toDecimalOrNull(row.refunds_nal),
        refundsCashless: this.toDecimalOrNull(row.refunds_beznal),
        mobilePay: this.toDecimalOrNull(row.mobile_pay),
        yandexPay: this.toDecimalOrNull(row.yandex_pay),
        incassAmount: this.toDecimalOrNull(row.incass),
        middleCheck: this.toDecimalOrNull(row.middle_check),
        message: this.toNullableString(row.message),
        sourcePayloadHash: this.payloadHash(row),
      },
      update: {
        storeId: store.id,
        externalUserId,
        externalClubId,
        startedAt,
        stoppedAt,
        durationMinutes: this.durationMinutes(startedAt, stoppedAt),
        cashStart: this.toDecimalOrNull(row.start),
        cashAmount: this.toDecimalOrNull(row.nal),
        cashlessAmount: this.toDecimalOrNull(row.beznal),
        refundsCash: this.toDecimalOrNull(row.refunds_nal),
        refundsCashless: this.toDecimalOrNull(row.refunds_beznal),
        mobilePay: this.toDecimalOrNull(row.mobile_pay),
        yandexPay: this.toDecimalOrNull(row.yandex_pay),
        incassAmount: this.toDecimalOrNull(row.incass),
        middleCheck: this.toDecimalOrNull(row.middle_check),
        message: this.toNullableString(row.message),
        sourcePayloadHash: this.payloadHash(row),
      },
    });
  }

  private async syncShiftProductSalesFromLangame(
    tenantId: string,
    shift: ShiftReportActiveShift,
    now: Date,
  ) {
    const warnings: string[] = [];

    if (!shift.storeId || !shift.startedAt) {
      return warnings;
    }

    const store = await this.prisma.store.findFirst({
      where: { id: shift.storeId, tenantId },
      select: {
        id: true,
        name: true,
        timeZone: true,
        externalDomain: true,
        externalClubId: true,
        integrationSourceId: true,
      },
    });

    if (!store) {
      return warnings;
    }

    try {
      const { apiKey, sources } =
        await this.langameSettingsService.resolveTenantAccess(tenantId);
      const matchedSources = this.langameSourcesForStore(store, sources);
      const stoppedAt = shift.stoppedAt ?? now;
      const window = {
        dateFrom: this.toDateInputValue(
          new Date(shift.startedAt.getTime() - 12 * 60 * 60 * 1000),
        ),
        dateTo: this.toDateInputValue(
          new Date(stoppedAt.getTime() + 12 * 60 * 60 * 1000),
        ),
      };

      for (const source of matchedSources) {
        try {
          await this.syncProductSalesFromSource(
            tenantId,
            store,
            source,
            apiKey,
            window,
          );
        } catch (error) {
          warnings.push(
            `${source.domain}: ${
              error instanceof Error
                ? error.message
                : 'не удалось обновить продажи товаров Langame'
            }`,
          );
        }
      }
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : 'Langame API временно недоступен для обновления продаж',
      );
    }

    return warnings;
  }

  private async syncProductSalesFromSource(
    tenantId: string,
    store: ShiftReportStore,
    source: ShiftReportSource,
    apiKey: string,
    window: { dateFrom: string; dateTo: string },
  ) {
    const productsByExternalId = await this.loadProductMap(
      tenantId,
      source.domain,
    );
    const storesByExternalClubId = new Map<
      string | null,
      { id: string; name: string }
    >([[store.externalClubId, { id: store.id, name: store.name }]]);

    for (let page = 1; page <= 5; page += 1) {
      const rows = await this.langameClient.listProductExpenses(
        source.baseUrl,
        apiKey,
        {
          page,
          pageLimit: SHIFT_REPORT_LANGAME_PAGE_LIMIT,
          dateFrom: window.dateFrom,
          dateTo: window.dateTo,
        },
      );

      for (const row of rows) {
        await this.upsertProductSaleFromLangameRow(
          tenantId,
          store,
          source.domain,
          productsByExternalId,
          storesByExternalClubId,
          row,
        );
      }

      if (rows.length < SHIFT_REPORT_LANGAME_PAGE_LIMIT) {
        break;
      }
    }
  }

  private async upsertProductSaleFromLangameRow(
    tenantId: string,
    store: ShiftReportStore,
    domain: string,
    productsByExternalId: Map<string, { id: string; name: string }>,
    storesByExternalClubId: Map<string | null, { id: string; name: string }>,
    row: LangameProductExpense,
  ) {
    const externalSaleId = this.toNullableString(row.id);
    const externalProductId = this.toNullableString(row.list_goods_id);
    const externalClubId = this.toNullableString(row.list_clubs_id);

    if (!externalSaleId || !externalProductId) {
      return;
    }

    if (
      store.externalClubId &&
      externalClubId &&
      externalClubId !== store.externalClubId
    ) {
      return;
    }

    const product = await this.resolveSaleProduct(
      tenantId,
      domain,
      productsByExternalId,
      externalProductId,
    );
    const saleStore =
      externalClubId && !storesByExternalClubId.has(externalClubId)
        ? await this.resolveSaleStore(
            tenantId,
            domain,
            storesByExternalClubId,
            externalClubId,
          )
        : (storesByExternalClubId.get(externalClubId) ??
          storesByExternalClubId.get(store.externalClubId) ?? {
            id: store.id,
            name: store.name,
          });
    const isCanceled = Number(row.cancel) === 1;
    const quantity = isCanceled ? 0 : Number(row.count ?? 0);
    const salePrice =
      this.toDecimalOrNull(row.price_sale) ?? new Prisma.Decimal(0);
    const purchasePrice =
      this.toDecimalOrNull(row.price_purchase) ?? new Prisma.Decimal(0);
    const saleDate =
      this.parseLangameDate(this.toNullableString(row.date), store.timeZone) ??
      new Date();
    const sourcePayloadHash = this.payloadHash(row);

    await this.prisma.salesFact.upsert({
      where: {
        tenantId_externalProvider_externalDomain_externalSaleId: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalSaleId,
        },
      },
      create: {
        tenantId,
        storeId: saleStore.id,
        productId: product.id,
        saleDate,
        quantity: new Prisma.Decimal(quantity),
        revenue: isCanceled ? new Prisma.Decimal(0) : salePrice.mul(quantity),
        cost: isCanceled ? new Prisma.Decimal(0) : purchasePrice.mul(quantity),
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
        externalSaleId,
        externalProductId,
        externalClubId,
        productNameAtSale: product.name,
        storeNameAtSale: saleStore.name,
        sourcePayloadHash,
        isCanceled,
        canceledAt: isCanceled ? new Date() : null,
      },
      update: {
        storeId: saleStore.id,
        productId: product.id,
        saleDate,
        quantity: new Prisma.Decimal(quantity),
        revenue: isCanceled ? new Prisma.Decimal(0) : salePrice.mul(quantity),
        cost: isCanceled ? new Prisma.Decimal(0) : purchasePrice.mul(quantity),
        externalProductId,
        externalClubId,
        productNameAtSale: product.name,
        storeNameAtSale: saleStore.name,
        sourcePayloadHash,
        isCanceled,
        canceledAt: isCanceled ? new Date() : null,
      },
    });
  }

  private async findShiftOptions(
    tenantId: string,
    storeId: string | null,
    selectedShiftId: string | null,
    now: Date,
  ): Promise<StaffShiftReportShiftOption[]> {
    if (!storeId) {
      return [];
    }

    const recentSince = new Date(
      now.getTime() - SHIFT_REPORT_RECENT_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const openRows = await this.prisma.guestWorkingShift.findMany({
      where: {
        tenantId,
        storeId,
        stoppedAt: null,
      },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ startedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 15,
    });
    const closedRows = await this.prisma.guestWorkingShift.findMany({
      where: {
        tenantId,
        storeId,
        stoppedAt: { not: null },
        OR: [
          { startedAt: { gte: recentSince } },
          { stoppedAt: { gte: recentSince } },
          ...(selectedShiftId ? [{ id: selectedShiftId }] : []),
        ],
      },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [
        { stoppedAt: 'desc' },
        { startedAt: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: 30,
    });
    const rowsById = new Map(
      [...openRows, ...closedRows].map((row) => [row.id, row]),
    );
    const rows = Array.from(rowsById.values()).slice(0, 30);
    const userFilters = rows
      .filter((row) => row.externalDomain && row.externalUserId)
      .map((row) => ({
        externalDomain: row.externalDomain as string,
        externalUserId: row.externalUserId as string,
      }));
    const users =
      userFilters.length > 0
        ? await this.prisma.langameStaffUser.findMany({
            where: {
              tenantId,
              OR: userFilters,
            },
            select: {
              externalDomain: true,
              externalUserId: true,
              username: true,
              email: true,
            },
          })
        : [];
    const usersByKey = new Map(
      users.map((user) => [
        `${user.externalDomain}:${user.externalUserId}`,
        user,
      ]),
    );

    return rows.map((row) => {
      const user =
        row.externalDomain && row.externalUserId
          ? usersByKey.get(`${row.externalDomain}:${row.externalUserId}`)
          : null;

      return {
        id: row.id,
        externalUserId: row.externalUserId,
        operatorName:
          user?.username ??
          user?.email ??
          `user_id ${row.externalUserId ?? 'не указан'}`,
        storeName: row.store?.name ?? 'Клуб не указан',
        startedAt: row.startedAt?.toISOString() ?? null,
        stoppedAt: row.stoppedAt?.toISOString() ?? null,
        status: row.stoppedAt ? 'CLOSED' : 'OPEN',
        isSelected: row.id === selectedShiftId,
      };
    });
  }

  private findChecklistRuns(
    tenantId: string,
    userId: string,
    storeId: string | null,
    since: Date,
  ) {
    return this.prisma.staffChecklistRun.findMany({
      where: {
        tenantId,
        ...(storeId ? { storeId } : {}),
        OR: [{ assignedToUserId: userId }, { createdByUserId: userId }],
        updatedAt: { gte: since },
      },
      orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 20,
    });
  }

  private findCompletedTasks(
    tenantId: string,
    userId: string,
    storeId: string | null,
    since: Date,
  ) {
    return this.prisma.staffTask.findMany({
      where: {
        tenantId,
        ...(storeId ? { storeId } : {}),
        assignedToUserId: userId,
        status: { in: ['DONE', 'ON_REVIEW'] },
        updatedAt: { gte: since },
      },
      select: {
        id: true,
        title: true,
        status: true,
        completedAt: true,
        updatedAt: true,
      },
      orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 30,
    });
  }

  private collectChecklistAttachments(
    checklists: Array<{ answers: Prisma.JsonValue }>,
  ): StaffShiftReportAttachment[] {
    const attachments = new Map<string, StaffShiftReportAttachment>();

    for (const checklist of checklists) {
      const answers = Array.isArray(checklist.answers) ? checklist.answers : [];

      for (const answer of answers) {
        const record = this.asRecord(answer);
        const rawAttachments = Array.isArray(record.evidenceAttachments)
          ? record.evidenceAttachments
          : [];

        for (const rawAttachment of rawAttachments) {
          const attachment = this.normalizeAttachment(rawAttachment);

          if (attachment) {
            attachments.set(attachment.id, attachment);
          }
        }
      }
    }

    return Array.from(attachments.values()).slice(
      0,
      SHIFT_REPORT_ATTACHMENT_LIMIT,
    );
  }

  private async resolveFinancials(
    tenantId: string,
    storeId: string | null,
    activeShift: ShiftReportActiveShift | null,
    now: Date,
  ): Promise<StaffShiftReportFinancials> {
    const startedAt = activeShift?.startedAt ?? null;
    const stoppedAt = activeShift?.stoppedAt ?? null;
    const productWindowEnd = stoppedAt ?? now;
    const emptyGroup = { quantity: 0, revenue: 0 };
    const cashAmount = this.decimalToNumber(activeShift?.cashAmount);
    const cashlessAmount = this.decimalToNumber(activeShift?.cashlessAmount);
    const mobilePay = this.decimalToNumber(activeShift?.mobilePay);
    const yandexPay = this.decimalToNumber(activeShift?.yandexPay);
    const refundsCash = this.decimalToNumber(activeShift?.refundsCash);
    const refundsCashless = this.decimalToNumber(activeShift?.refundsCashless);
    const refundsAmount =
      refundsCash === null && refundsCashless === null
        ? null
        : this.round((refundsCash ?? 0) + (refundsCashless ?? 0), 2);
    const shiftCashTotal =
      cashAmount === null &&
      cashlessAmount === null &&
      mobilePay === null &&
      yandexPay === null &&
      refundsAmount === null
        ? null
        : this.round(
            (cashAmount ?? 0) +
              (cashlessAmount ?? 0) +
              (mobilePay ?? 0) +
              (yandexPay ?? 0) -
              (refundsAmount ?? 0),
            2,
          );
    const sourceNotes: string[] = [];

    if (activeShift) {
      sourceNotes.push('Касса смены: Langame /working_shifts/list.');
    } else {
      sourceNotes.push(
        'Касса смены не заполнена: активная смена Langame для сотрудника не найдена.',
      );
    }

    let sales: ShiftReportSalesFact[] = [];
    let productSalesRead = false;

    if (storeId && startedAt) {
      try {
        sales = await this.findShiftProductSales(
          tenantId,
          storeId,
          startedAt,
          productWindowEnd,
        );
        productSalesRead = true;
        sourceNotes.push(
          'Бар и товары: Langame /products/expense, сохранено в SalesFact.',
        );
      } catch {
        sourceNotes.push(
          'Бар и товары не заполнены: не удалось прочитать продажи SalesFact.',
        );
      }
    } else {
      sourceNotes.push(
        'Бар и товары не заполнены: нет клуба или времени начала смены.',
      );
    }

    const productRevenue = productSalesRead
      ? this.round(
          sales.reduce(
            (sum, sale) => sum + (this.decimalToNumber(sale.revenue) ?? 0),
            0,
          ),
          2,
        )
      : null;
    const groups = this.groupProductSales(sales);

    if (sales.length > 0) {
      sourceNotes.push(
        'Кальяны, девайсы и мерч распознаны по названию товара или категории; отчет можно скорректировать перед отправкой.',
      );
    }

    return {
      sourceWindowStartedAt: startedAt?.toISOString() ?? null,
      sourceWindowStoppedAt: stoppedAt?.toISOString() ?? null,
      cashAmount,
      cashlessAmount,
      mobilePay,
      yandexPay,
      refundsAmount,
      incassAmount: this.decimalToNumber(activeShift?.incassAmount),
      shiftCashTotal,
      productRevenue,
      productSalesCount: sales.length,
      hookahs: groups.hookahs ?? emptyGroup,
      devices: groups.devices ?? emptyGroup,
      merch: groups.merch ?? emptyGroup,
      sourceNotes,
    };
  }

  private async findShiftProductSales(
    tenantId: string,
    storeId: string,
    startedAt: Date,
    stoppedAt: Date,
  ): Promise<ShiftReportSalesFact[]> {
    const rows = await this.prisma.salesFact.findMany({
      where: {
        tenantId,
        storeId,
        isCanceled: false,
        saleDate: {
          gte: startedAt,
          lte: stoppedAt,
        },
      },
      select: {
        revenue: true,
        quantity: true,
        productNameAtSale: true,
        externalProductId: true,
        productId: true,
      },
    });

    const productIds = Array.from(new Set(rows.map((row) => row.productId)));
    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { tenantId, id: { in: productIds } },
            select: {
              id: true,
              name: true,
              category: { select: { name: true } },
            },
          })
        : [];
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    return rows.map((row) => {
      const product = productsById.get(row.productId);
      const fallbackProductName = row.externalProductId
        ? `Langame product #${row.externalProductId}`
        : null;

      return {
        ...row,
        productName: product?.name ?? fallbackProductName,
        categoryName: product?.category?.name ?? null,
      };
    });
  }

  private groupProductSales(sales: ShiftReportSalesFact[]) {
    const groups = {
      hookahs: { quantity: 0, revenue: 0 },
      devices: { quantity: 0, revenue: 0 },
      merch: { quantity: 0, revenue: 0 },
    } satisfies Record<string, StaffShiftReportProductGroup>;

    for (const sale of sales) {
      const group = this.resolveProductReportGroup(sale);

      if (!group) {
        continue;
      }

      groups[group].quantity = this.round(
        groups[group].quantity + (this.decimalToNumber(sale.quantity) ?? 0),
        2,
      );
      groups[group].revenue = this.round(
        groups[group].revenue + (this.decimalToNumber(sale.revenue) ?? 0),
        2,
      );
    }

    return groups;
  }

  private resolveProductReportGroup(sale: ShiftReportSalesFact) {
    const haystack = [
      sale.productNameAtSale,
      sale.productName,
      sale.categoryName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('ru-RU');

    if (/кальян|hookah|табак|уголь|калауд|чаша|мундштук|смесь/.test(haystack)) {
      return 'hookahs' as const;
    }

    if (
      /девайс|device|аренд|джойст|геймпад|dualshock|playstation|ps4|ps5|vr|руль/.test(
        haystack,
      )
    ) {
      return 'devices' as const;
    }

    if (
      /мерч|merch|футбол|худи|толстов|кепк|стикер|брелок|шоппер|значок/.test(
        haystack,
      )
    ) {
      return 'merch' as const;
    }

    return null;
  }

  private resolveMissingData(financials: StaffShiftReportFinancials) {
    const missing: string[] = [];

    if (financials.cashAmount === null) {
      missing.push('наличные');
    }
    if (
      financials.cashlessAmount === null &&
      financials.mobilePay === null &&
      financials.yandexPay === null
    ) {
      missing.push('безналичные');
    }
    if (financials.productRevenue === null) {
      missing.push('бар и товарные продажи');
    }
    if (financials.shiftCashTotal === null) {
      missing.push('итоговая сумма смены');
    }

    missing.push('кто принял смену');

    return missing;
  }

  private normalizeAttachment(value: unknown) {
    const record = this.asRecord(value);
    const id = this.normalizeOptionalString(record.id);
    const url = this.normalizeOptionalString(record.url);

    if (!id || !url) {
      return null;
    }

    return {
      id,
      url,
      fileName: this.normalizeOptionalString(record.fileName) ?? 'Файл',
      contentType:
        this.normalizeOptionalString(record.contentType) ??
        'application/octet-stream',
      byteSize: this.normalizeInteger(record.byteSize),
      createdAt: this.normalizeOptionalString(record.createdAt) ?? '',
    } satisfies StaffShiftReportAttachment;
  }

  private buildDraftBody(input: {
    clubName: string;
    dateLabel: string;
    dayPartLabel: string;
    administratorName: string;
    checklists: Array<{
      title: string;
      status: string;
      requiredItemsDone: number;
      requiredItemsTotal: number;
      evidenceDone: number;
      evidenceTotal: number;
    }>;
    tasks: Array<{ title: string; status: string }>;
    attachments: StaffShiftReportAttachment[];
    financials: StaffShiftReportFinancials;
  }) {
    const checklistLines = input.checklists.length
      ? input.checklists.map(
          (item) =>
            `- ${item.title}: ${item.requiredItemsDone}/${item.requiredItemsTotal} пунктов, доказательства ${item.evidenceDone}/${item.evidenceTotal}, статус ${item.status}`,
        )
      : ['- чек-листы за смену не найдены'];
    const taskLines = input.tasks.length
      ? input.tasks.map((task) => `- ${task.title}: ${task.status}`)
      : ['- выполненные задачи за смену не найдены'];
    const attachmentLines = input.attachments.length
      ? input.attachments.map(
          (attachment) => `- ${attachment.fileName}: ${attachment.url}`,
        )
      : ['- фото и файлы пока не приложены'];
    const financialNoteLines = input.financials.sourceNotes.length
      ? input.financials.sourceNotes.map((note) => `- ${note}`)
      : ['- источники финансовых данных не определены'];
    const cashNote =
      input.financials.incassAmount !== null &&
      input.financials.incassAmount > 0
        ? ` (инкассация ${this.formatMoney(input.financials.incassAmount)})`
        : '';
    const cashlessBreakdown = this.formatCashlessBreakdown(input.financials);
    const refundsLine =
      input.financials.refundsAmount !== null &&
      input.financials.refundsAmount > 0
        ? [`Возвраты: ${this.formatMoney(input.financials.refundsAmount)}`]
        : [];

    return [
      `Клуб: ${input.clubName}`,
      `Дата: ${input.dateLabel} (${input.dayPartLabel})`,
      `Администратор: ${input.administratorName}`,
      `Наличные: ${this.formatMoneyOrBlank(input.financials.cashAmount)}${cashNote}`,
      `Безналичные: ${this.formatMoneyOrBlank(this.cashlessTotal(input.financials))}${cashlessBreakdown}`,
      `Бар: ${this.formatMoneyOrBlank(input.financials.productRevenue)}`,
      `Кальяны: ${this.formatProductGroup(input.financials.hookahs)}`,
      `Девайсы: ${this.formatProductGroup(input.financials.devices)}`,
      `Мерч: ${this.formatProductGroup(input.financials.merch)}`,
      `ИТОГО: ${this.formatMoneyOrBlank(input.financials.shiftCashTotal)}`,
      ...refundsLine,
      '',
      'Смену принял: ',
      '',
      'Источники данных:',
      ...financialNoteLines,
      '',
      'Чек-листы:',
      ...checklistLines,
      '',
      'Выполненные задачи:',
      ...taskLines,
      '',
      'Фото и файлы:',
      ...attachmentLines,
    ].join('\n');
  }

  private async ensureReportingChannel(tenantId: string) {
    return this.prisma.staffChatChannel.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: STAFF_CHAT_REPORTING_CHANNEL_NAME,
        },
      },
      create: {
        tenantId,
        name: STAFF_CHAT_REPORTING_CHANNEL_NAME,
        description: STAFF_CHAT_REPORTING_CHANNEL_DESCRIPTION,
        scope: 'NETWORK',
        roleScope: 'ALL_STAFF',
        isDefault: true,
      },
      update: {
        description: STAFF_CHAT_REPORTING_CHANNEL_DESCRIPTION,
        isDefault: true,
        isArchived: false,
      },
      select: { id: true },
    });
  }

  private async resolveAttachmentIds(
    tenantId: string,
    userId: string,
    values: string[] | null | undefined,
  ) {
    const requestedIds = this.uniqueStrings(values).slice(
      0,
      SHIFT_REPORT_ATTACHMENT_LIMIT,
    );

    if (requestedIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.staffAttachment.findMany({
      where: {
        tenantId,
        uploadedByUserId: userId,
        id: { in: requestedIds },
      },
      select: { id: true },
    });
    const availableIds = new Set(rows.map((row) => row.id));

    return requestedIds.filter((id) => availableIds.has(id));
  }

  private async resolveStoreId(
    tenantId: string,
    value: string | null | undefined,
  ) {
    const id = this.normalizeOptionalString(value);

    if (!id) {
      return null;
    }

    const store = await this.prisma.store.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    return store?.id ?? null;
  }

  private uniqueStrings(values: string[] | null | undefined) {
    return Array.isArray(values)
      ? Array.from(
          new Set(
            values
              .map((value) => this.normalizeOptionalString(value))
              .filter((value): value is string => Boolean(value)),
          ),
        )
      : [];
  }

  private cashlessTotal(financials: StaffShiftReportFinancials) {
    const values = [
      financials.cashlessAmount,
      financials.mobilePay,
      financials.yandexPay,
    ];

    if (values.every((value) => value === null)) {
      return null;
    }

    return this.round(
      values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      2,
    );
  }

  private formatCashlessBreakdown(financials: StaffShiftReportFinancials) {
    const parts = [
      financials.cashlessAmount !== null
        ? `карта ${this.formatMoney(financials.cashlessAmount)}`
        : null,
      financials.mobilePay !== null && financials.mobilePay > 0
        ? `mobile ${this.formatMoney(financials.mobilePay)}`
        : null,
      financials.yandexPay !== null && financials.yandexPay > 0
        ? `Yandex ${this.formatMoney(financials.yandexPay)}`
        : null,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 1 ? ` (${parts.join(', ')})` : '';
  }

  private formatProductGroup(group: StaffShiftReportProductGroup) {
    if (group.quantity <= 0 && group.revenue <= 0) {
      return '0';
    }

    return `${this.formatQuantity(group.quantity)} шт (${this.formatMoney(group.revenue)})`;
  }

  private formatMoneyOrBlank(value: number | null) {
    return value === null ? '' : this.formatMoney(value);
  }

  private formatMoney(value: number) {
    return `${this.round(value, 2).toLocaleString('ru-RU', {
      maximumFractionDigits: 2,
    })} руб.`;
  }

  private formatQuantity(value: number) {
    return this.round(value, 2).toLocaleString('ru-RU', {
      maximumFractionDigits: 2,
    });
  }

  private decimalToNumber(value: Prisma.Decimal | null | undefined) {
    if (value === null || value === undefined) {
      return null;
    }

    const parsed = value.toNumber();

    return Number.isFinite(parsed) ? parsed : null;
  }

  private round(value: number, fractionDigits = 0) {
    const factor = 10 ** fractionDigits;

    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private langameSourcesForStore(
    store: ShiftReportStore,
    sources: ShiftReportSource[],
  ) {
    const exactSources = sources.filter((source) => {
      if (
        store.integrationSourceId &&
        source.id === store.integrationSourceId
      ) {
        return true;
      }

      return Boolean(
        store.externalDomain && source.domain === store.externalDomain,
      );
    });

    if (exactSources.length > 0) {
      return exactSources;
    }

    return store.externalDomain
      ? sources.filter((source) => source.domain === store.externalDomain)
      : sources.length === 1
        ? sources
        : [];
  }

  private async loadProductMap(tenantId: string, domain: string) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
        externalProductId: { not: null },
      },
      select: {
        id: true,
        name: true,
        externalProductId: true,
      },
    });

    return new Map(
      products
        .filter((product) => product.externalProductId)
        .map((product) => [
          product.externalProductId as string,
          {
            id: product.id,
            name: product.name,
          },
        ]),
    );
  }

  private async resolveSaleProduct(
    tenantId: string,
    domain: string,
    productsByExternalId: Map<string, { id: string; name: string }>,
    externalProductId: string,
  ) {
    const existing = productsByExternalId.get(externalProductId);

    if (existing) {
      return existing;
    }

    const placeholderName = `Langame product #${externalProductId}`;
    const product = await this.prisma.product.upsert({
      where: {
        tenantId_externalProvider_externalDomain_externalProductId: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalProductId,
        },
      },
      create: {
        tenantId,
        article: `LG-${domain}-${externalProductId}`,
        name: placeholderName,
        purchasePrice: new Prisma.Decimal(0),
        salePrice: new Prisma.Decimal(0),
        isActive: false,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
        externalProductId,
        externalMissingSince: new Date(),
      },
      update: {
        isActive: false,
        externalMissingSince: new Date(),
      },
      select: {
        id: true,
        name: true,
      },
    });
    const resolved = { id: product.id, name: product.name };
    productsByExternalId.set(externalProductId, resolved);

    return resolved;
  }

  private async resolveSaleStore(
    tenantId: string,
    domain: string,
    storesByExternalClubId: Map<string | null, { id: string; name: string }>,
    externalClubId: string,
  ) {
    const existing = storesByExternalClubId.get(externalClubId);

    if (existing) {
      return existing;
    }

    const placeholderName = `Langame club #${externalClubId}`;
    const store = await this.prisma.store.upsert({
      where: {
        tenantId_externalProvider_externalDomain_externalClubId: {
          tenantId,
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: domain,
          externalClubId,
        },
      },
      create: {
        tenantId,
        name: placeholderName,
        isActive: false,
        externalProvider: IntegrationProvider.LANGAME,
        externalDomain: domain,
        externalClubId,
      },
      update: {
        isActive: false,
      },
      select: {
        id: true,
        name: true,
      },
    });
    const resolved = { id: store.id, name: store.name };
    storesByExternalClubId.set(externalClubId, resolved);

    return resolved;
  }

  private parseLangameDate(
    value: string | null | undefined,
    timeZone?: string | null,
  ) {
    return parseLangameDateValue(value, timeZone);
  }

  private toDateInputValue(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private durationMinutes(startedAt: Date | null, stoppedAt: Date | null) {
    if (!startedAt || !stoppedAt || stoppedAt < startedAt) {
      return null;
    }

    return Math.round((stoppedAt.getTime() - startedAt.getTime()) / 60_000);
  }

  private toDecimalOrNull(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const stringValue = this.scalarToString(value);
    if (!stringValue) {
      return null;
    }

    try {
      return new Prisma.Decimal(stringValue.replace(',', '.'));
    } catch {
      return null;
    }
  }

  private toNullableString(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const stringValue = this.scalarToString(value)?.trim();
    return stringValue ? stringValue : null;
  }

  private scalarToString(value: unknown) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    return null;
  }

  private payloadHash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private normalizeRequiredString(
    value: string | null | undefined,
    label: string,
    maxLength: number,
  ) {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      throw new BadRequestException(`${label} is required`);
    }

    return normalized.slice(0, maxLength);
  }

  private normalizeOptionalString(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    return value.trim() || null;
  }

  private normalizeInteger(value: unknown) {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : 0;

    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private formatDate(value: Date, timeZone: string) {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(value);
  }

  private resolveDayPart(value: Date, timeZone: string) {
    const hour = Number(
      new Intl.DateTimeFormat('ru-RU', {
        timeZone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(value),
    );

    return hour >= 8 && hour < 21 ? 'день' : 'ночь';
  }
}

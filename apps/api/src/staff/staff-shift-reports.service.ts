import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  STAFF_CHAT_REPORTING_CHANNEL_DESCRIPTION,
  STAFF_CHAT_REPORTING_CHANNEL_NAME,
} from './staff-team-chat.service';

const SHIFT_REPORT_ATTACHMENT_LIMIT = 20;

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

export type StaffShiftReportDraft = {
  generatedAt: string;
  storeId: string | null;
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
  financials: StaffShiftReportFinancials;
  missingData: string[];
  body: string;
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

type ShiftReportSalesFact = Prisma.SalesFactGetPayload<{
  select: {
    revenue: true;
    quantity: true;
    productNameAtSale: true;
    product: {
      select: {
        name: true;
        category: { select: { name: true } };
      };
    };
  };
}>;

@Injectable()
export class StaffShiftReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getDraft(user: AuthenticatedUser): Promise<StaffShiftReportDraft> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const now = new Date();
    const member = await this.prisma.staffMember.findFirst({
      where: { tenantId, userId: user.id },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            timeZone: true,
          },
        },
      },
    });
    const storeId = member?.storeId ?? null;
    const timeZone = member?.store?.timeZone ?? 'Asia/Yekaterinburg';
    const activeShift = await this.findActiveShift(
      tenantId,
      storeId,
      member?.externalUserId ?? null,
    );
    const since =
      activeShift?.startedAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const checklists = await this.findChecklistRuns(
      tenantId,
      user.id,
      storeId,
      since,
    );
    const tasks = await this.findCompletedTasks(
      tenantId,
      user.id,
      storeId,
      since,
    );
    const financials = await this.resolveFinancials(
      tenantId,
      storeId,
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
      storeId,
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

  private async findActiveShift(
    tenantId: string,
    storeId: string | null,
    externalUserId: string | null,
  ) {
    if (!externalUserId) {
      return null;
    }

    return this.prisma.guestWorkingShift.findFirst({
      where: {
        tenantId,
        externalUserId,
        stoppedAt: null,
        ...(storeId ? { storeId } : {}),
      },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ startedAt: 'desc' }, { updatedAt: 'desc' }],
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

    if (storeId && startedAt) {
      sales = await this.prisma.salesFact.findMany({
        where: {
          tenantId,
          storeId,
          isCanceled: false,
          saleDate: {
            gte: startedAt,
            lte: productWindowEnd,
          },
        },
        select: {
          revenue: true,
          quantity: true,
          productNameAtSale: true,
          product: {
            select: {
              name: true,
              category: { select: { name: true } },
            },
          },
        },
      });
      sourceNotes.push(
        'Бар и товары: Langame /products/expense, сохранено в SalesFact.',
      );
    } else {
      sourceNotes.push(
        'Бар и товары не заполнены: нет клуба или времени начала смены.',
      );
    }

    const productRevenue =
      storeId && startedAt
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
      sale.product.name,
      sale.product.category?.name,
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

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
    const attachments = this.collectChecklistAttachments(checklists);
    const clubName =
      activeShift?.store?.name ?? member?.store?.name ?? 'Клуб не указан';
    const administratorName =
      member?.displayName ?? user.fullName ?? user.email ?? 'Администратор';
    const dateLabel = this.formatDate(now, timeZone);
    const dayPartLabel = this.resolveDayPart(now, timeZone);
    const missingData = [
      'наличные',
      'безналичные',
      'кальяны',
      'девайсы',
      'мерч',
      'итоговая сумма смены',
      'кто принял смену',
    ];

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
      missingData,
      body: this.buildDraftBody({
        clubName,
        dateLabel,
        dayPartLabel,
        administratorName,
        checklists,
        tasks,
        attachments,
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

    return [
      `Клуб: ${input.clubName}`,
      `Дата: ${input.dateLabel} (${input.dayPartLabel})`,
      `Администратор: ${input.administratorName}`,
      'Наличные: ',
      'Безналичные: ',
      'Бар: ',
      'Кальяны: ',
      'Девайсы: ',
      'Мерч: ',
      'ИТОГО: ',
      '',
      'Смену принял: ',
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

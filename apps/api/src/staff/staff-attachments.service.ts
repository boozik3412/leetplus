import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  resolveStaffAttachmentAclMode,
  type StaffAttachmentAclMode,
} from '../config/environment-validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { StaffTeamChatService } from './staff-team-chat.service';
import { StaffTasksService } from './staff-tasks.service';

export const STAFF_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const STAFF_ATTACHMENT_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export type StaffAttachmentUploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

export type StaffAttachmentResponse = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  url: string;
  createdAt: string;
  pendingExpiresAt: string | null;
  uploadedByUser: { id: string; email: string; fullName: string | null } | null;
};

export type StaffAttachmentFile = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

const attachmentSelect = {
  id: true,
  fileName: true,
  contentType: true,
  byteSize: true,
  createdAt: true,
  pendingExpiresAt: true,
  uploadedByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffAttachmentSelect;

type StaffAttachmentRow = Prisma.StaffAttachmentGetPayload<{
  select: typeof attachmentSelect;
}>;

@Injectable()
export class StaffAttachmentsService {
  private readonly logger = new Logger(StaffAttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tenantContextService: TenantContextService,
    private readonly staffTeamChatService: StaffTeamChatService,
    private readonly staffTasksService: StaffTasksService,
  ) {}

  async createAttachment(
    user: AuthenticatedUser,
    file: StaffAttachmentUploadFile | undefined,
  ): Promise<StaffAttachmentResponse> {
    const tenant = this.tenantContextService.resolve(user);
    const buffer = file?.buffer;

    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('File is required');
    }

    if (buffer.length > STAFF_ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('File is too large');
    }

    const fileName = this.normalizeFileName(file?.originalname);
    const contentType = this.normalizeContentType(file?.mimetype);
    const stateChangedAt = new Date();
    const pendingExpiresAt = new Date(
      stateChangedAt.getTime() + STAFF_ATTACHMENT_PENDING_TTL_MS,
    );

    const row = await this.prisma.staffAttachment.create({
      data: {
        tenantId: tenant.tenantId,
        uploadedByUserId: user.id,
        fileName,
        contentType,
        byteSize: buffer.length,
        data: Uint8Array.from(buffer),
        state: 'PENDING',
        pendingExpiresAt,
        stateReasonCode: null,
        stateChangedAt,
      },
      select: attachmentSelect,
    });

    return this.toResponse(row);
  }

  async getAttachment(
    user: AuthenticatedUser,
    id: string,
  ): Promise<StaffAttachmentFile> {
    const tenant = this.tenantContextService.resolve(user);
    const aclMode = resolveStaffAttachmentAclMode(
      this.configService.get<string>('STAFF_ATTACHMENT_ACL_MODE'),
    );

    const file = await this.prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const metadata = await tx.staffAttachment.findFirst({
          where: { id, tenantId: tenant.tenantId },
          select: {
            state: true,
            uploadedByUserId: true,
            pendingExpiresAt: true,
            bindings: {
              where: { state: 'BOUND' },
              select: {
                resourceKind: true,
                resourceId: true,
              },
            },
          },
        });

        if (!metadata) {
          return null;
        }

        let strictDecision: boolean | null = null;
        let shadowReasonCode = 'STRICT_DENY';

        if (aclMode !== 'LEGACY') {
          try {
            strictDecision = await this.canReadStrict(
              user,
              id,
              tenant.tenantId,
              metadata,
              tx,
              now,
              aclMode === 'ENFORCED',
            );
          } catch (error) {
            if (aclMode === 'ENFORCED') {
              throw error;
            }

            strictDecision = false;
            shadowReasonCode = 'STRICT_AUTHORIZER_ERROR';
          }
        }

        if (aclMode === 'SHADOW' && strictDecision === false) {
          this.logShadowMismatch(metadata, aclMode, shadowReasonCode);
        }

        if (aclMode === 'ENFORCED' && strictDecision !== true) {
          return null;
        }

        const row = await tx.staffAttachment.findFirst({
          where: {
            id,
            tenantId: tenant.tenantId,
            ...(aclMode === 'ENFORCED' ? { state: metadata.state } : {}),
          },
          select: {
            fileName: true,
            contentType: true,
            data: true,
          },
        });

        if (!row) {
          return null;
        }

        return {
          fileName: row.fileName,
          contentType: row.contentType,
          buffer: Buffer.from(row.data),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );

    if (!file) {
      throw new NotFoundException('Attachment not found');
    }

    return file;
  }

  private async canReadStrict(
    user: AuthenticatedUser,
    id: string,
    tenantId: string,
    metadata: {
      state: string;
      uploadedByUserId: string | null;
      pendingExpiresAt: Date | null;
      bindings: Array<{ resourceKind: string; resourceId: string }>;
    },
    tx: Prisma.TransactionClient,
    now: Date,
    quarantineExpiredPending: boolean,
  ) {
    if (metadata.state === 'PENDING') {
      if (
        metadata.pendingExpiresAt !== null &&
        metadata.pendingExpiresAt <= now
      ) {
        if (quarantineExpiredPending) {
          await tx.staffAttachment.updateMany({
            where: {
              id,
              tenantId,
              state: 'PENDING',
              pendingExpiresAt: { lte: now },
            },
            data: {
              state: 'QUARANTINED',
              pendingExpiresAt: null,
              stateReasonCode: 'PENDING_EXPIRED',
              stateChangedAt: now,
            },
          });
        }

        return false;
      }

      return (
        metadata.uploadedByUserId === user.id &&
        metadata.pendingExpiresAt !== null &&
        metadata.pendingExpiresAt > now
      );
    }

    if (metadata.state !== 'BOUND') {
      return false;
    }

    const messageIds = metadata.bindings
      .filter((binding) => binding.resourceKind === 'CHAT_MESSAGE')
      .map((binding) => binding.resourceId);

    if (
      messageIds.length > 0 &&
      (await this.staffTeamChatService.canReadAnyAttachmentMessage(
        user,
        messageIds,
        tx,
      ))
    ) {
      return true;
    }

    const taskIds = metadata.bindings
      .filter((binding) => binding.resourceKind === 'STAFF_TASK')
      .map((binding) => binding.resourceId);

    if (taskIds.length === 0) {
      return false;
    }

    return this.staffTasksService.canReadAnyAttachmentTask(user, taskIds, tx);
  }

  private logShadowMismatch(
    metadata: {
      state: string;
      bindings: Array<{ resourceKind: string }>;
    },
    aclMode: StaffAttachmentAclMode,
    reasonCode: string,
  ) {
    this.logger.warn(
      JSON.stringify({
        event: 'staff_attachment_acl_shadow_mismatch',
        aclMode,
        legacyDecision: 'ALLOW',
        strictDecision: 'DENY',
        reasonCode,
        attachmentState: metadata.state,
        resourceKinds: Array.from(
          new Set(metadata.bindings.map((binding) => binding.resourceKind)),
        ).sort(),
        releaseSha: this.configService.get<string>('RELEASE_SHA') ?? null,
      }),
    );
  }

  private normalizeFileName(value: string | null | undefined) {
    const normalized = (value ?? 'attachment')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);

    return normalized || 'attachment';
  }

  private normalizeContentType(value: string | null | undefined) {
    const normalized = (value ?? 'application/octet-stream')
      .trim()
      .slice(0, 120);

    return normalized || 'application/octet-stream';
  }

  private toResponse(row: StaffAttachmentRow): StaffAttachmentResponse {
    return {
      id: row.id,
      fileName: row.fileName,
      contentType: row.contentType,
      byteSize: row.byteSize,
      url: `/staff/attachments/${row.id}`,
      createdAt: row.createdAt.toISOString(),
      pendingExpiresAt: row.pendingExpiresAt?.toISOString() ?? null,
      uploadedByUser: row.uploadedByUser,
    };
  }
}

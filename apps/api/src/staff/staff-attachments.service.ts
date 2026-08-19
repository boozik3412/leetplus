import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { type AccessCapability, hasCapability } from '../auth/capabilities';
import {
  resolveStaffAttachmentAclMode,
  type StaffAttachmentAclMode,
} from '../config/environment-validation';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { lockUserRoleAuthority } from '../users/user-role-authority-lock';
import { StaffTeamChatService } from './staff-team-chat.service';
import { StaffTasksService } from './staff-tasks.service';
import { StaffKnowledgeAccessPolicyService } from './staff-knowledge-access-policy.service';
import { StaffShiftRegulationAccessPolicyService } from './staff-shift-regulation-access-policy.service';
import { StaffTrainingAccessPolicyService } from './staff-training-access-policy.service';

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

type BoundAttachmentResource = {
  resourceKind: string;
  resourceId: string;
};

const networkParentCapabilities = {
  CHECKLIST_RUN: 'view_staff_standards',
  KNOWLEDGE_ARTICLE: 'view_staff_knowledge',
  SHIFT_REGULATION: 'view_staff_standards',
  TRAINING_COURSE: 'view_staff_training',
  ONBOARDING_PLAN: 'view_staff_training',
} as const satisfies Record<string, AccessCapability>;

type NetworkAttachmentResourceKind = keyof typeof networkParentCapabilities;

@Injectable()
export class StaffAttachmentsService {
  private readonly logger = new Logger(StaffAttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tenantContextService: TenantContextService,
    private readonly staffTeamChatService: StaffTeamChatService,
    private readonly staffTasksService: StaffTasksService,
    private readonly freshStoreScopeService: FreshStoreScopeService,
    private readonly staffKnowledgeAccessPolicyService: StaffKnowledgeAccessPolicyService,
    private readonly staffShiftRegulationAccessPolicyService: StaffShiftRegulationAccessPolicyService,
    private readonly staffTrainingAccessPolicyService: StaffTrainingAccessPolicyService,
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
        if (
          aclMode === 'ENFORCED' &&
          !(await this.lockAttachmentAuthority(
            tx,
            id,
            tenant.tenantId,
            user.id,
          ))
        ) {
          return null;
        }

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
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );

    if (!file) {
      throw new NotFoundException('Attachment not found');
    }

    return file;
  }

  private async lockAttachmentAuthority(
    tx: Prisma.TransactionClient,
    attachmentId: string,
    tenantId: string,
    userId: string,
  ) {
    const rows = await tx.$queryRaw<
      Array<{
        attachmentId: string;
        customRoleId: string | null;
        role: string;
        userId: string;
      }>
    >(Prisma.sql`
      SELECT
        attachment."id" AS "attachmentId",
        subject."customRoleId",
        subject."role"::text AS "role",
        subject."id" AS "userId"
      FROM "StaffAttachment" AS attachment
      INNER JOIN "User" AS subject
        ON subject."id" = ${userId}
        AND subject."tenantId" = ${tenantId}
      WHERE attachment."id" = ${attachmentId}
        AND attachment."tenantId" = ${tenantId}
      FOR SHARE OF attachment, subject
    `);

    const authority = rows[0];
    const exactAuthority =
      rows.length === 1 &&
      authority?.attachmentId === attachmentId &&
      authority.userId === userId &&
      typeof authority.role === 'string' &&
      authority.role.length > 0 &&
      (authority.customRoleId === null ||
        (typeof authority.customRoleId === 'string' &&
          authority.customRoleId.length > 0));

    if (!exactAuthority) {
      return false;
    }

    await lockUserRoleAuthority(tx, {
      tenantId,
      role: authority.role,
      customRoleId: authority.customRoleId,
    });
    return true;
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

    if (
      taskIds.length > 0 &&
      (await this.staffTasksService.canReadAnyAttachmentTask(user, taskIds, tx))
    ) {
      return true;
    }

    return this.canReadAnyNetworkParent(user, metadata.bindings, tx);
  }

  private async canReadAnyNetworkParent(
    user: AuthenticatedUser,
    bindings: readonly BoundAttachmentResource[],
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const grouped = new Map<NetworkAttachmentResourceKind, Set<string>>();

    for (const binding of bindings) {
      if (
        !Object.prototype.hasOwnProperty.call(
          networkParentCapabilities,
          binding.resourceKind,
        )
      ) {
        continue;
      }

      const resourceKind =
        binding.resourceKind as NetworkAttachmentResourceKind;
      if (!hasCapability(user, networkParentCapabilities[resourceKind])) {
        continue;
      }

      const resourceId = binding.resourceId.trim();
      if (!resourceId) {
        continue;
      }

      const ids = grouped.get(resourceKind) ?? new Set<string>();
      ids.add(resourceId);
      grouped.set(resourceKind, ids);
    }

    if (grouped.size === 0) {
      return false;
    }

    const knowledgeArticleIds = grouped.get('KNOWLEDGE_ARTICLE');
    if (knowledgeArticleIds && knowledgeArticleIds.size > 0) {
      const knowledgeAccess =
        await this.staffKnowledgeAccessPolicyService.resolve(user);
      const knowledgeArticle = await tx.staffKnowledgeArticle.findFirst({
        where: this.staffKnowledgeAccessPolicyService.readableArticleIdsWhere(
          knowledgeAccess,
          [...knowledgeArticleIds],
        ),
        select: { id: true },
      });

      if (knowledgeArticle) {
        return true;
      }
    }

    grouped.delete('KNOWLEDGE_ARTICLE');

    const shiftRegulationIds = grouped.get('SHIFT_REGULATION');
    if (shiftRegulationIds && shiftRegulationIds.size > 0) {
      const regulationAccess =
        await this.staffShiftRegulationAccessPolicyService.resolve(user);
      const regulation = await tx.staffShiftRegulation.findFirst({
        where:
          this.staffShiftRegulationAccessPolicyService.readableRegulationIdsWhere(
            regulationAccess,
            [...shiftRegulationIds],
          ),
        select: { id: true },
      });

      if (regulation) {
        return true;
      }
    }

    grouped.delete('SHIFT_REGULATION');

    const trainingCourseIds = grouped.get('TRAINING_COURSE');
    if (trainingCourseIds && trainingCourseIds.size > 0) {
      const trainingAccess =
        await this.staffTrainingAccessPolicyService.resolve(user);
      const course = await tx.staffTrainingCourse.findFirst({
        where: this.staffTrainingAccessPolicyService.readableCourseIdsWhere(
          trainingAccess,
          [...trainingCourseIds],
        ),
        select: { id: true },
      });

      if (course) {
        return true;
      }
    }

    grouped.delete('TRAINING_COURSE');

    const onboardingPlanIds = grouped.get('ONBOARDING_PLAN');
    if (onboardingPlanIds && onboardingPlanIds.size > 0) {
      const trainingAccess =
        await this.staffTrainingAccessPolicyService.resolve(user);
      const plan = await tx.staffOnboardingPlan.findFirst({
        where:
          this.staffTrainingAccessPolicyService.readableOnboardingPlanIdsWhere(
            trainingAccess,
            [...onboardingPlanIds],
          ),
        select: { id: true },
      });

      if (plan) {
        return true;
      }
    }

    grouped.delete('ONBOARDING_PLAN');
    if (grouped.size === 0) {
      return false;
    }

    const scope = await this.freshStoreScopeService.resolve(user);

    // Remaining parent workspaces are still protected by
    // FreshNetworkScopeGuard. Do not let their files become a side door for a
    // STORES subject before each parent receives a store-aware policy.
    if (scope.mode !== 'NETWORK') {
      return false;
    }

    for (const [resourceKind, resourceIds] of grouped) {
      const where = {
        id: { in: [...resourceIds] },
        tenantId: scope.tenantId,
      };
      let parent: { id: string } | null = null;

      switch (resourceKind) {
        case 'CHECKLIST_RUN':
          parent = await tx.staffChecklistRun.findFirst({
            where,
            select: { id: true },
          });
          break;
      }

      if (parent) {
        return true;
      }
    }

    return false;
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

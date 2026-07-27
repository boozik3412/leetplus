import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

type BindPendingChatAttachmentsInput = {
  tenantId: string;
  actorUserId: string;
  messageId: string;
  attachmentIds: readonly string[];
};

type LockedAttachmentRow = {
  id: string;
  tenantId: string;
  uploadedByUserId: string | null;
  state: string;
  pendingExpiresAt: Date | null;
};

@Injectable()
export class StaffAttachmentBindingsService {
  async bindPendingChatAttachments(
    tx: Prisma.TransactionClient,
    input: BindPendingChatAttachmentsInput,
  ) {
    const attachmentIds = Array.from(new Set(input.attachmentIds));

    if (attachmentIds.length === 0) {
      return;
    }

    const rows = await tx.$queryRaw<LockedAttachmentRow[]>(Prisma.sql`
      SELECT
        attachment."id",
        attachment."tenantId",
        attachment."uploadedByUserId",
        attachment."state"::text AS "state",
        attachment."pendingExpiresAt"
      FROM "StaffAttachment" AS attachment
      WHERE attachment."tenantId" = ${input.tenantId}
        AND attachment."id" IN (${Prisma.join(attachmentIds)})
      ORDER BY attachment."id"
      FOR UPDATE
    `);
    const now = new Date();
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const allAvailable = attachmentIds.every((attachmentId) => {
      const row = rowsById.get(attachmentId);

      return (
        row?.tenantId === input.tenantId &&
        row.uploadedByUserId === input.actorUserId &&
        row.state === 'PENDING' &&
        row.pendingExpiresAt !== null &&
        row.pendingExpiresAt > now
      );
    });

    if (!allAvailable) {
      throw new BadRequestException('Attachment is not available');
    }

    await tx.staffChatMessageAttachment.createMany({
      data: attachmentIds.map((attachmentId) => ({
        tenantId: input.tenantId,
        messageId: input.messageId,
        attachmentId,
      })),
      skipDuplicates: true,
    });

    await tx.staffAttachmentBinding.createMany({
      data: attachmentIds.map((attachmentId) => ({
        tenantId: input.tenantId,
        attachmentId,
        candidateAttachmentId: attachmentId,
        resourceKind: 'CHAT_MESSAGE',
        resourceId: input.messageId,
        state: 'BOUND',
        source: 'NATIVE',
        sourceKey: this.sourceKey(
          `native:chat-message:${input.messageId}:attachment:${attachmentId}`,
        ),
        createdByUserId: input.actorUserId,
        resolvedAt: now,
      })),
      skipDuplicates: false,
    });

    const transition = await tx.staffAttachment.updateMany({
      where: {
        id: { in: attachmentIds },
        tenantId: input.tenantId,
        uploadedByUserId: input.actorUserId,
        state: 'PENDING',
        pendingExpiresAt: { gt: now },
      },
      data: {
        state: 'BOUND',
        pendingExpiresAt: null,
        stateReasonCode: null,
        stateChangedAt: now,
      },
    });

    if (transition.count !== attachmentIds.length) {
      throw new BadRequestException('Attachment is not available');
    }
  }

  private sourceKey(locator: string) {
    return createHash('sha256').update(locator).digest('hex');
  }
}

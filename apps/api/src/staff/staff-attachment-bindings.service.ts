import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StaffAttachmentResourceKind } from '@prisma/client';
import { createHash } from 'node:crypto';

type BindPendingChatAttachmentsInput = {
  tenantId: string;
  actorUserId: string;
  messageId: string;
  attachmentIds: readonly string[];
};

export type BindPendingResourceAttachmentsInput = {
  tenantId: string;
  actorUserId: string;
  resourceKind: StaffAttachmentResourceKind;
  resourceId: string;
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
    await this.bindPendingResourceAttachmentsInternal(
      tx,
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        resourceKind: StaffAttachmentResourceKind.CHAT_MESSAGE,
        resourceId: input.messageId,
        attachmentIds: input.attachmentIds,
      },
      async (attachmentIds) => {
        await tx.staffChatMessageAttachment.createMany({
          data: attachmentIds.map((attachmentId) => ({
            tenantId: input.tenantId,
            messageId: input.messageId,
            attachmentId,
          })),
          skipDuplicates: true,
        });
      },
    );
  }

  async bindPendingResourceAttachments(
    tx: Prisma.TransactionClient,
    input: BindPendingResourceAttachmentsInput,
  ) {
    await this.bindPendingResourceAttachmentsInternal(tx, input);
  }

  private async bindPendingResourceAttachmentsInternal(
    tx: Prisma.TransactionClient,
    input: BindPendingResourceAttachmentsInput,
    beforeBinding?: (attachmentIds: readonly string[]) => Promise<void>,
  ) {
    const attachmentIds = Array.from(new Set(input.attachmentIds)).sort();

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
    const existingBindings = await tx.staffAttachmentBinding.findMany({
      where: {
        tenantId: input.tenantId,
        resourceKind: input.resourceKind,
        resourceId: input.resourceId,
        state: 'BOUND',
        attachmentId: { in: attachmentIds },
      },
      select: { attachmentId: true },
    });
    const now = new Date();
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const alreadyBoundIds = new Set(
      existingBindings.flatMap((binding) =>
        binding.attachmentId ? [binding.attachmentId] : [],
      ),
    );
    const allAvailable = attachmentIds.every((attachmentId) => {
      const row = rowsById.get(attachmentId);

      if (row?.tenantId !== input.tenantId) {
        return false;
      }

      if (row.state === 'BOUND') {
        return alreadyBoundIds.has(attachmentId);
      }

      return (
        row.uploadedByUserId === input.actorUserId &&
        row.state === 'PENDING' &&
        row.pendingExpiresAt !== null &&
        row.pendingExpiresAt > now
      );
    });

    if (!allAvailable) {
      throw new BadRequestException('Attachment is not available');
    }

    await beforeBinding?.(attachmentIds);

    const pendingAttachmentIds = attachmentIds.filter(
      (attachmentId) => !alreadyBoundIds.has(attachmentId),
    );

    if (pendingAttachmentIds.length === 0) {
      return;
    }

    await tx.staffAttachmentBinding.createMany({
      data: pendingAttachmentIds.map((attachmentId) => ({
        tenantId: input.tenantId,
        attachmentId,
        candidateAttachmentId: attachmentId,
        resourceKind: input.resourceKind,
        resourceId: input.resourceId,
        state: 'BOUND',
        source: 'NATIVE',
        sourceKey: this.sourceKey(
          `native:${input.resourceKind.toLowerCase()}:${input.resourceId}:attachment:${attachmentId}`,
        ),
        createdByUserId: input.actorUserId,
        resolvedAt: now,
      })),
      skipDuplicates: false,
    });

    const transition = await tx.staffAttachment.updateMany({
      where: {
        id: { in: pendingAttachmentIds },
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

    if (transition.count !== pendingAttachmentIds.length) {
      throw new BadRequestException('Attachment is not available');
    }
  }

  private sourceKey(locator: string) {
    return createHash('sha256').update(locator).digest('hex');
  }
}

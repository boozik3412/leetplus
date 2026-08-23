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

type NativeBindingRow = {
  attachmentId: string | null;
  id: string;
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

  async syncNativeResourceAttachments(
    tx: Prisma.TransactionClient,
    input: BindPendingResourceAttachmentsInput,
  ) {
    const desiredAttachmentIds = this.normalizeAttachmentIds(
      input.attachmentIds,
    );
    const currentBindings = await tx.staffAttachmentBinding.findMany({
      where: {
        tenantId: input.tenantId,
        resourceKind: input.resourceKind,
        resourceId: input.resourceId,
        source: 'NATIVE',
        state: 'BOUND',
        attachmentId: { not: null },
      },
      select: { id: true, attachmentId: true },
      orderBy: { id: 'asc' },
    });
    const currentAttachmentIds = this.bindingAttachmentIds(currentBindings);
    const allAttachmentIds = this.normalizeAttachmentIds([
      ...currentAttachmentIds,
      ...desiredAttachmentIds,
    ]);
    const lockedRows = await this.lockAttachments(
      tx,
      input.tenantId,
      allAttachmentIds,
    );

    await this.bindPendingResourceAttachmentsInternal(
      tx,
      { ...input, attachmentIds: desiredAttachmentIds },
      undefined,
      lockedRows,
    );

    const desiredAttachmentIdSet = new Set(desiredAttachmentIds);
    const removedBindings = currentBindings.filter(
      (binding) =>
        binding.attachmentId !== null &&
        !desiredAttachmentIdSet.has(binding.attachmentId),
    );

    if (removedBindings.length === 0) {
      return;
    }

    const removedAttachmentIds = this.bindingAttachmentIds(removedBindings);
    const deletion = await tx.staffAttachmentBinding.deleteMany({
      where: {
        id: { in: removedBindings.map((binding) => binding.id) },
        tenantId: input.tenantId,
        resourceKind: input.resourceKind,
        resourceId: input.resourceId,
        source: 'NATIVE',
        state: 'BOUND',
      },
    });

    if (deletion.count !== removedBindings.length) {
      throw new BadRequestException('Attachment binding changed concurrently');
    }

    const remainingBindings = await tx.staffAttachmentBinding.findMany({
      where: {
        tenantId: input.tenantId,
        state: 'BOUND',
        attachmentId: { in: removedAttachmentIds },
      },
      select: { attachmentId: true },
    });
    const stillBoundIds = new Set(
      remainingBindings.flatMap((binding) =>
        binding.attachmentId ? [binding.attachmentId] : [],
      ),
    );
    const quarantineIds = removedAttachmentIds.filter(
      (attachmentId) => !stillBoundIds.has(attachmentId),
    );

    if (quarantineIds.length === 0) {
      return;
    }

    const now = new Date();
    const transition = await tx.staffAttachment.updateMany({
      where: {
        id: { in: quarantineIds },
        tenantId: input.tenantId,
        state: 'BOUND',
      },
      data: {
        state: 'QUARANTINED',
        pendingExpiresAt: null,
        stateReasonCode: 'NATIVE_REFERENCE_REMOVED',
        stateChangedAt: now,
      },
    });

    if (transition.count !== quarantineIds.length) {
      throw new BadRequestException('Attachment binding changed concurrently');
    }
  }

  private async bindPendingResourceAttachmentsInternal(
    tx: Prisma.TransactionClient,
    input: BindPendingResourceAttachmentsInput,
    beforeBinding?: (attachmentIds: readonly string[]) => Promise<void>,
    prelockedRows?: readonly LockedAttachmentRow[],
  ) {
    const attachmentIds = this.normalizeAttachmentIds(input.attachmentIds);

    if (attachmentIds.length === 0) {
      return;
    }

    const rows = prelockedRows
      ? prelockedRows.filter((row) => attachmentIds.includes(row.id))
      : await this.lockAttachments(tx, input.tenantId, attachmentIds);
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

  private async lockAttachments(
    tx: Prisma.TransactionClient,
    tenantId: string,
    attachmentIds: readonly string[],
  ) {
    if (attachmentIds.length === 0) {
      return [];
    }

    return tx.$queryRaw<LockedAttachmentRow[]>(Prisma.sql`
      SELECT
        attachment."id",
        attachment."tenantId",
        attachment."uploadedByUserId",
        attachment."state"::text AS "state",
        attachment."pendingExpiresAt"
      FROM "StaffAttachment" AS attachment
      WHERE attachment."tenantId" = ${tenantId}
        AND attachment."id" IN (${Prisma.join(attachmentIds)})
      ORDER BY attachment."id"
      FOR UPDATE
    `);
  }

  private bindingAttachmentIds(bindings: readonly NativeBindingRow[]) {
    return this.normalizeAttachmentIds(
      bindings.flatMap((binding) =>
        binding.attachmentId ? [binding.attachmentId] : [],
      ),
    );
  }

  private normalizeAttachmentIds(attachmentIds: readonly string[]) {
    return Array.from(new Set(attachmentIds)).sort();
  }

  private sourceKey(locator: string) {
    return createHash('sha256').update(locator).digest('hex');
  }
}

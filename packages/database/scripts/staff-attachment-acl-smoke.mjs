import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

const REQUIRED_CONFIRMATION = 'run-staff-attachment-acl-fixtures';

if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'Staff attachment ACL smoke fixtures are prohibited in production.',
  );
}

if (process.env.STAFF_ATTACHMENT_ACL_SMOKE_CONFIRM !== REQUIRED_CONFIRMATION) {
  throw new Error(
    `Set STAFF_ATTACHMENT_ACL_SMOKE_CONFIRM=${REQUIRED_CONFIRMATION} to run staff attachment ACL smoke fixtures.`,
  );
}

const prisma = new PrismaClient();
const concurrentDeleteClientA = new PrismaClient();
const concurrentDeleteClientB = new PrismaClient();
const fixtureId = randomUUID();
const tenantIds = [];
const storeIds = [];
const userIds = [];
const channelIds = [];
const messageIds = [];
const taskIds = [];
const attachmentIds = [];
const bindingIds = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sourceKey(locator) {
  return createHash('sha256').update(locator).digest('hex');
}

async function expectConstraintFailure(label, operation, expectedMessage) {
  let error;

  try {
    await operation();
  } catch (caught) {
    error = caught;
  }

  if (!error) {
    throw new Error(`${label}: expected PostgreSQL to reject the operation.`);
  }

  const rendered = String(error);
  if (!rendered.includes(expectedMessage)) {
    throw new Error(
      `${label}: PostgreSQL rejected the operation for an unexpected reason: ${rendered}`,
    );
  }
}

try {
  const attachmentColumns = await prisma.$queryRaw`
    SELECT
      column_name,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'StaffAttachment'
      AND column_name IN (
        'state',
        'pendingExpiresAt',
        'stateReasonCode',
        'stateChangedAt'
      )
    ORDER BY column_name
  `;

  assert(
    attachmentColumns.length === 4,
    'Expected all StaffAttachment EXPAND lifecycle columns.',
  );
  const stateColumn = attachmentColumns.find(
    (column) => column.column_name === 'state',
  );
  assert(
    stateColumn?.is_nullable === 'NO' &&
      String(stateColumn.column_default).includes('UNRESOLVED'),
    'N-1 attachment inserts must default to fail-closed UNRESOLVED.',
  );

  const constraints = await prisma.$queryRaw`
    SELECT conname, convalidated
    FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname IN (
        'StaffAttachment_state_shape_check',
        'StaffAttachmentBinding_state_shape_check',
        'StaffAttachmentBinding_source_key_check'
      )
    ORDER BY conname
  `;
  assert(
    constraints.length === 3,
    'Expected attachment and binding shape constraints.',
  );
  assert(
    constraints.find(
      (constraint) =>
        constraint.conname === 'StaffAttachment_state_shape_check',
    )?.convalidated === false,
    'Existing attachment rows must remain in the staged NOT VALID expand state.',
  );

  const concurrentIndexes = await prisma.$queryRaw`
    SELECT
      index_class.relname AS index_name,
      index_metadata.indisready,
      index_metadata.indisvalid
    FROM pg_index AS index_metadata
    JOIN pg_class AS index_class
      ON index_class.oid = index_metadata.indexrelid
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_class.relnamespace
    WHERE index_namespace.oid = current_schema()::regnamespace
      AND index_class.relname IN (
        'staff_attachment_tenant_state_created_idx',
        'staff_attachment_pending_expiry_idx'
      )
    ORDER BY index_class.relname
  `;
  assert(
    concurrentIndexes.length === 2 &&
      concurrentIndexes.every(
        (index) => index.indisready === true && index.indisvalid === true,
      ),
    'Both concurrent StaffAttachment indexes must be ready and valid.',
  );

  const tenantA = await prisma.tenant.create({
    data: {
      name: `Attachment ACL smoke A ${fixtureId}`,
      slug: `attachment-acl-smoke-a-${fixtureId}`,
    },
  });
  tenantIds.push(tenantA.id);
  const tenantB = await prisma.tenant.create({
    data: {
      name: `Attachment ACL smoke B ${fixtureId}`,
      slug: `attachment-acl-smoke-b-${fixtureId}`,
    },
  });
  tenantIds.push(tenantB.id);

  const storeA = await prisma.store.create({
    data: {
      tenantId: tenantA.id,
      name: `Attachment ACL smoke A1 ${fixtureId}`,
    },
  });
  storeIds.push(storeA.id);
  const storeB = await prisma.store.create({
    data: {
      tenantId: tenantB.id,
      name: `Attachment ACL smoke B1 ${fixtureId}`,
    },
  });
  storeIds.push(storeB.id);

  const userA = await prisma.user.create({
    data: {
      tenantId: tenantA.id,
      email: `attachment-acl-a-${fixtureId}@invalid.example`,
      passwordHash: 'not-a-real-password-hash',
      role: 'MANAGER',
      accessScope: 'STORES',
    },
  });
  userIds.push(userA.id);
  const userB = await prisma.user.create({
    data: {
      tenantId: tenantB.id,
      email: `attachment-acl-b-${fixtureId}@invalid.example`,
      passwordHash: 'not-a-real-password-hash',
      role: 'MANAGER',
      accessScope: 'STORES',
    },
  });
  userIds.push(userB.id);

  const channelA = await prisma.staffChatChannel.create({
    data: {
      tenantId: tenantA.id,
      createdByUserId: userA.id,
      storeId: storeA.id,
      name: `Attachment ACL smoke A ${fixtureId}`,
      scope: 'STORE',
    },
  });
  channelIds.push(channelA.id);
  const channelB = await prisma.staffChatChannel.create({
    data: {
      tenantId: tenantB.id,
      createdByUserId: userB.id,
      storeId: storeB.id,
      name: `Attachment ACL smoke B ${fixtureId}`,
      scope: 'STORE',
    },
  });
  channelIds.push(channelB.id);

  const messageA = await prisma.staffChatMessage.create({
    data: {
      tenantId: tenantA.id,
      channelId: channelA.id,
      authorUserId: userA.id,
      storeId: storeA.id,
      body: 'Attachment ACL smoke A',
    },
  });
  messageIds.push(messageA.id);
  const messageB = await prisma.staffChatMessage.create({
    data: {
      tenantId: tenantB.id,
      channelId: channelB.id,
      authorUserId: userB.id,
      storeId: storeB.id,
      body: 'Attachment ACL smoke B',
    },
  });
  messageIds.push(messageB.id);

  const taskA = await prisma.staffTask.create({
    data: {
      tenantId: tenantA.id,
      storeId: storeA.id,
      createdByUserId: userA.id,
      assignedToUserId: userA.id,
      title: 'Attachment ACL task smoke A',
    },
  });
  taskIds.push(taskA.id);

  const pendingAttachment = await prisma.staffAttachment.create({
    data: {
      tenantId: tenantA.id,
      uploadedByUserId: userA.id,
      fileName: 'attachment-acl-smoke.txt',
      contentType: 'text/plain',
      byteSize: 5,
      data: Uint8Array.from(Buffer.from('smoke')),
      state: 'PENDING',
      pendingExpiresAt: new Date(Date.now() + 60_000),
      stateReasonCode: null,
    },
  });
  attachmentIds.push(pendingAttachment.id);

  const legacyDefaultAttachment = await prisma.staffAttachment.create({
    data: {
      tenantId: tenantA.id,
      uploadedByUserId: userA.id,
      fileName: 'attachment-acl-legacy.txt',
      contentType: 'text/plain',
      byteSize: 6,
      data: Uint8Array.from(Buffer.from('legacy')),
    },
  });
  attachmentIds.push(legacyDefaultAttachment.id);
  assert(
    legacyDefaultAttachment.state === 'UNRESOLVED' &&
      legacyDefaultAttachment.stateReasonCode === 'LEGACY_UNCLASSIFIED',
    'An omitted lifecycle must stay fail-closed for N-1 compatibility.',
  );

  await expectConstraintFailure(
    'invalid PENDING shape',
    () =>
      prisma.staffAttachment.create({
        data: {
          tenantId: tenantA.id,
          uploadedByUserId: userA.id,
          fileName: 'invalid-pending.txt',
          contentType: 'text/plain',
          byteSize: 1,
          data: Uint8Array.from([1]),
          state: 'PENDING',
          pendingExpiresAt: new Date(Date.now() - 60_000),
          stateReasonCode: null,
        },
      }),
    'StaffAttachment_state_shape_check',
  );

  await expectConstraintFailure(
    'BOUND without binding',
    () =>
      prisma.staffAttachment.update({
        where: { id: legacyDefaultAttachment.id },
        data: {
          state: 'BOUND',
          stateReasonCode: null,
        },
      }),
    'Staff attachment BOUND state must match the existence of a BOUND binding',
  );

  await expectConstraintFailure(
    'foreign-tenant parent',
    () =>
      prisma.staffAttachmentBinding.create({
        data: {
          tenantId: tenantA.id,
          attachmentId: pendingAttachment.id,
          candidateAttachmentId: pendingAttachment.id,
          resourceKind: 'CHAT_MESSAGE',
          resourceId: messageB.id,
          state: 'BOUND',
          source: 'NATIVE',
          sourceKey: sourceKey(`foreign-parent:${fixtureId}`),
          createdByUserId: userA.id,
          resolvedAt: new Date(),
        },
      }),
    'Staff attachment binding and parent must share a tenant',
  );

  await expectConstraintFailure(
    'foreign-tenant attachment',
    () =>
      prisma.staffAttachmentBinding.create({
        data: {
          tenantId: tenantB.id,
          attachmentId: pendingAttachment.id,
          candidateAttachmentId: pendingAttachment.id,
          resourceKind: 'CHAT_MESSAGE',
          resourceId: messageB.id,
          state: 'BOUND',
          source: 'NATIVE',
          sourceKey: sourceKey(`foreign-attachment:${fixtureId}`),
          createdByUserId: userB.id,
          resolvedAt: new Date(),
        },
      }),
    'Staff attachment binding and attachment must share a tenant',
  );

  const bindingId = randomUUID();
  bindingIds.push(bindingId);
  await prisma.$transaction(async (transaction) => {
    await transaction.staffAttachmentBinding.create({
      data: {
        id: bindingId,
        tenantId: tenantA.id,
        attachmentId: pendingAttachment.id,
        candidateAttachmentId: pendingAttachment.id,
        resourceKind: 'CHAT_MESSAGE',
        resourceId: messageA.id,
        state: 'BOUND',
        source: 'NATIVE',
        sourceKey: sourceKey(`native-chat:${fixtureId}`),
        createdByUserId: userA.id,
        resolvedAt: new Date(),
      },
    });
    await transaction.staffAttachment.update({
      where: { id: pendingAttachment.id },
      data: {
        state: 'BOUND',
        pendingExpiresAt: null,
        stateReasonCode: null,
        stateChangedAt: new Date(),
      },
    });
  });

  const boundAttachment = await prisma.staffAttachment.findUniqueOrThrow({
    where: { id: pendingAttachment.id },
    include: { bindings: true },
  });
  assert(
    boundAttachment.state === 'BOUND' &&
      boundAttachment.bindings.length === 1 &&
      boundAttachment.bindings[0]?.resourceStoreId === storeA.id,
    'Atomic bind must derive the parent store and finish in BOUND state.',
  );

  const taskPendingAttachment = await prisma.staffAttachment.create({
    data: {
      tenantId: tenantA.id,
      uploadedByUserId: userA.id,
      fileName: 'attachment-acl-task-smoke.txt',
      contentType: 'text/plain',
      byteSize: 4,
      data: Uint8Array.from(Buffer.from('task')),
      state: 'PENDING',
      pendingExpiresAt: new Date(Date.now() + 60_000),
      stateReasonCode: null,
    },
  });
  attachmentIds.push(taskPendingAttachment.id);
  const taskBindingId = randomUUID();
  bindingIds.push(taskBindingId);

  await prisma.$transaction(async (transaction) => {
    await transaction.staffAttachmentBinding.create({
      data: {
        id: taskBindingId,
        tenantId: tenantA.id,
        attachmentId: taskPendingAttachment.id,
        candidateAttachmentId: taskPendingAttachment.id,
        resourceKind: 'STAFF_TASK',
        resourceId: taskA.id,
        state: 'BOUND',
        source: 'NATIVE',
        sourceKey: sourceKey(`native-task:${fixtureId}`),
        createdByUserId: userA.id,
        resolvedAt: new Date(),
      },
    });
    await transaction.staffAttachment.update({
      where: { id: taskPendingAttachment.id },
      data: {
        state: 'BOUND',
        pendingExpiresAt: null,
        stateReasonCode: null,
        stateChangedAt: new Date(),
      },
    });
  });

  const taskBoundAttachment =
    await prisma.staffAttachment.findUniqueOrThrow({
      where: { id: taskPendingAttachment.id },
      include: { bindings: true },
    });
  assert(
    taskBoundAttachment.state === 'BOUND' &&
      taskBoundAttachment.bindings.length === 1 &&
      taskBoundAttachment.bindings[0]?.resourceKind === 'STAFF_TASK' &&
      taskBoundAttachment.bindings[0]?.resourceId === taskA.id &&
      taskBoundAttachment.bindings[0]?.resourceStoreId === storeA.id,
    'STAFF_TASK bind must resolve the live task parent and derive its store.',
  );

  await expectConstraintFailure(
    'BOUND attachment tenant mutation',
    () =>
      prisma.staffAttachment.update({
        where: { id: pendingAttachment.id },
        data: { tenantId: tenantB.id },
      }),
    'Staff attachment and all BOUND bindings must share a tenant',
  );

  const concurrentDeleteAttachment = await prisma.staffAttachment.create({
    data: {
      tenantId: tenantA.id,
      uploadedByUserId: userA.id,
      fileName: 'attachment-acl-concurrent-delete.txt',
      contentType: 'text/plain',
      byteSize: 8,
      data: Uint8Array.from(Buffer.from('parallel')),
      state: 'PENDING',
      pendingExpiresAt: new Date(Date.now() + 60_000),
      stateReasonCode: null,
    },
  });
  attachmentIds.push(concurrentDeleteAttachment.id);

  const concurrentBindingIds = [randomUUID(), randomUUID()];
  bindingIds.push(...concurrentBindingIds);
  await prisma.$transaction(async (transaction) => {
    for (const [index, concurrentBindingId] of
      concurrentBindingIds.entries()) {
      await transaction.staffAttachmentBinding.create({
        data: {
          id: concurrentBindingId,
          tenantId: tenantA.id,
          attachmentId: concurrentDeleteAttachment.id,
          candidateAttachmentId: concurrentDeleteAttachment.id,
          resourceKind: 'CHAT_MESSAGE',
          resourceId: messageA.id,
          state: 'BOUND',
          source: 'NATIVE',
          sourceKey: sourceKey(
            `parallel-delete:${fixtureId}:${String(index)}`,
          ),
          createdByUserId: userA.id,
          resolvedAt: new Date(),
        },
      });
    }
    await transaction.staffAttachment.update({
      where: { id: concurrentDeleteAttachment.id },
      data: {
        state: 'BOUND',
        pendingExpiresAt: null,
        stateReasonCode: null,
        stateChangedAt: new Date(),
      },
    });
  });

  let signalFirstDelete;
  const firstDeleteReached = new Promise((resolve) => {
    signalFirstDelete = resolve;
  });
  const firstDelete = concurrentDeleteClientA
    .$transaction(
      async (transaction) => {
        await transaction.staffAttachmentBinding.delete({
          where: { id: concurrentBindingIds[0] },
        });
        signalFirstDelete();
        await new Promise((resolve) => setTimeout(resolve, 500));
      },
      { maxWait: 5_000, timeout: 10_000 },
    )
    .catch((error) => {
      signalFirstDelete();
      throw error;
    });

  await firstDeleteReached;
  const secondDelete = concurrentDeleteClientB.$transaction(
    (transaction) =>
      transaction.staffAttachmentBinding.delete({
        where: { id: concurrentBindingIds[1] },
      }),
    { maxWait: 5_000, timeout: 10_000 },
  );
  const parallelDeleteResults = await Promise.allSettled([
    firstDelete,
    secondDelete,
  ]);
  const successfulDeletes = parallelDeleteResults.filter(
    (result) => result.status === 'fulfilled',
  );
  const rejectedDeletes = parallelDeleteResults.filter(
    (result) => result.status === 'rejected',
  );
  assert(
    successfulDeletes.length === 1 && rejectedDeletes.length === 1,
    'Concurrent deletion of the last two BOUND links must allow exactly one transaction.',
  );
  assert(
    String(rejectedDeletes[0]?.reason).includes(
      'Staff attachment BOUND state must match the existence of a BOUND binding',
    ),
    `Concurrent deletion failed for an unexpected reason: ${String(
      rejectedDeletes[0]?.reason,
    )}`,
  );

  const remainingConcurrentBindings =
    await prisma.staffAttachmentBinding.findMany({
      where: {
        id: { in: concurrentBindingIds },
        attachmentId: concurrentDeleteAttachment.id,
        state: 'BOUND',
      },
    });
  assert(
    remainingConcurrentBindings.length === 1,
    'Concurrent deletion must leave one BOUND binding committed.',
  );
  await prisma.$transaction(async (transaction) => {
    await transaction.staffAttachmentBinding.update({
      where: { id: remainingConcurrentBindings[0].id },
      data: {
        attachmentId: null,
        state: 'QUARANTINED',
        reasonCode: 'SMOKE_CONCURRENT_DELETE_COMPLETE',
        resolvedAt: null,
      },
    });
    await transaction.staffAttachment.update({
      where: { id: concurrentDeleteAttachment.id },
      data: {
        state: 'QUARANTINED',
        stateReasonCode: 'SMOKE_CONCURRENT_DELETE_COMPLETE',
        stateChangedAt: new Date(),
      },
    });
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.staffAttachmentBinding.update({
      where: { id: bindingId },
      data: {
        attachmentId: null,
        state: 'QUARANTINED',
        reasonCode: 'SMOKE_REVOKED',
        resolvedAt: null,
      },
    });
    await transaction.staffAttachment.update({
      where: { id: pendingAttachment.id },
      data: {
        state: 'QUARANTINED',
        stateReasonCode: 'SMOKE_REVOKED',
        stateChangedAt: new Date(),
      },
    });
  });

  console.log(
    'Staff attachment ACL PostgreSQL smoke passed: fail-closed defaults, lifecycle shapes, valid concurrent indexes, same-tenant parent/blob checks, deferred chat/task atomic bind, tenant mutation rejection, serialized concurrent delete, derived store snapshot, and quarantine transition are enforced.',
  );
} finally {
  if (bindingIds.length > 0 && attachmentIds.length > 0) {
    await prisma.$transaction(async (transaction) => {
      await transaction.staffAttachmentBinding.updateMany({
        where: {
          id: { in: bindingIds },
          state: 'BOUND',
        },
        data: {
          attachmentId: null,
          state: 'QUARANTINED',
          reasonCode: 'SMOKE_CLEANUP',
          resolvedAt: null,
        },
      });
      await transaction.staffAttachment.updateMany({
        where: {
          id: { in: attachmentIds },
          state: 'BOUND',
        },
        data: {
          state: 'QUARANTINED',
          stateReasonCode: 'SMOKE_CLEANUP',
          stateChangedAt: new Date(),
        },
      });
    });
  }
  if (bindingIds.length > 0) {
    await prisma.staffAttachmentBinding.deleteMany({
      where: { id: { in: bindingIds } },
    });
  }
  if (messageIds.length > 0) {
    await prisma.staffChatMessage.deleteMany({
      where: { id: { in: messageIds } },
    });
  }
  if (taskIds.length > 0) {
    await prisma.staffTask.deleteMany({
      where: { id: { in: taskIds } },
    });
  }
  if (channelIds.length > 0) {
    await prisma.staffChatChannel.deleteMany({
      where: { id: { in: channelIds } },
    });
  }
  if (attachmentIds.length > 0) {
    await prisma.staffAttachment.deleteMany({
      where: { id: { in: attachmentIds } },
    });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
  if (storeIds.length > 0) {
    await prisma.store.deleteMany({
      where: { id: { in: storeIds } },
    });
  }
  if (tenantIds.length > 0) {
    await prisma.tenant.deleteMany({
      where: { id: { in: tenantIds } },
    });
  }
  await concurrentDeleteClientA.$disconnect();
  await concurrentDeleteClientB.$disconnect();
  await prisma.$disconnect();
}

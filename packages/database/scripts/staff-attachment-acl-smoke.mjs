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
const fixtureId = randomUUID();
const tenantIds = [];
const storeIds = [];
const userIds = [];
const channelIds = [];
const messageIds = [];
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
      accessScope: 'STORES',
    },
  });
  userIds.push(userA.id);
  const userB = await prisma.user.create({
    data: {
      tenantId: tenantB.id,
      email: `attachment-acl-b-${fixtureId}@invalid.example`,
      passwordHash: 'not-a-real-password-hash',
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
    'Staff attachment ACL PostgreSQL smoke passed: fail-closed defaults, lifecycle shapes, same-tenant parent/blob checks, deferred atomic bind, derived store snapshot, and quarantine transition are enforced.',
  );
} finally {
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
  await prisma.$disconnect();
}

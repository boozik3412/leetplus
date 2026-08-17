import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { resolveUserCapabilities } from '../src/auth/capabilities';
import { PrismaService } from '../src/prisma/prisma.service';
import type { StaffAttachmentBindingsService } from '../src/staff/staff-attachment-bindings.service';
import { StaffTeamChatService } from '../src/staff/staff-team-chat.service';
import { AccessScopeService } from '../src/tenancy/access-scope.service';
import { FreshStoreScopeService } from '../src/tenancy/fresh-store-scope.service';

const integrationConfirmation =
  'run-pilot-team-chat-fresh-scope-postgres-fixtures';
const integrationEnabled =
  process.env.PILOT_TEAM_CHAT_SCOPE_PG_CONFIRM === integrationConfirmation;
const describePostgres = integrationEnabled ? describe : describe.skip;

jest.setTimeout(30_000);

type Fixture = {
  tenantAId: string;
  tenantASlug: string;
  tenantBId: string;
  tenantBSlug: string;
  storeA1Id: string;
  storeA2Id: string;
  storeB1Id: string;
  userANetworkId: string;
  userA1Id: string;
  userBNetworkId: string;
  channelA1Id: string;
  channelA2Id: string;
  channelB1Id: string;
  messageA1Id: string;
  messageA2Id: string;
  messageB1Id: string;
};

describePostgres('Gate 1MT team chat PostgreSQL tenant/store matrix', () => {
  let prisma: PrismaService;
  const fixtureTenantIds = new Set<string>();

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterEach(async () => {
    for (const tenantId of fixtureTenantIds) {
      await cleanupFixture(prisma, tenantId);
    }
    fixtureTenantIds.clear();
  });

  afterAll(async () => {
    const [tenantResidue, userResidue, messageResidue] = await Promise.all([
      prisma.tenant.count({
        where: { slug: { startsWith: 'pilot-team-chat-' } },
      }),
      prisma.user.count({
        where: { email: { endsWith: '@team-chat.integration.invalid' } },
      }),
      prisma.staffChatMessage.count({
        where: { body: { startsWith: 'PG team-chat fixture ' } },
      }),
    ]);
    expect({ tenantResidue, userResidue, messageResidue }).toEqual({
      tenantResidue: 0,
      userResidue: 0,
      messageResidue: 0,
    });
    await prisma?.$disconnect();
  });

  it('isolates report and SSE reads across A/A1/A2 and B/B1', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const service = buildService(prisma);
    const userA1 = buildUser(fixture, 'A1');
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');

    const reportA1 = await service.getReport(userA1, {
      channelId: fixture.channelA1Id,
      storeId: fixture.storeA1Id,
    });
    expect(reportA1.messages.map(({ id }) => id)).toEqual([
      fixture.messageA1Id,
    ]);
    expect(reportA1.stores.map(({ id }) => id)).toEqual([fixture.storeA1Id]);
    expect(reportA1.channels.map(({ id }) => id)).toContain(
      fixture.channelA1Id,
    );
    expect(reportA1.channels.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining([fixture.channelA2Id, fixture.channelB1Id]),
    );

    const reportANetwork = await service.getReport(userANetwork, {
      channelId: fixture.channelA2Id,
    });
    expect(reportANetwork.messages.map(({ id }) => id)).toEqual([
      fixture.messageA2Id,
    ]);
    expect(reportANetwork.channels.map(({ id }) => id)).toEqual(
      expect.arrayContaining([fixture.channelA1Id, fixture.channelA2Id]),
    );
    expect(reportANetwork.channels.map(({ id }) => id)).not.toContain(
      fixture.channelB1Id,
    );

    const reportB = await service.getReport(userBNetwork, {
      channelId: fixture.channelB1Id,
    });
    expect(reportB.messages.map(({ id }) => id)).toEqual([fixture.messageB1Id]);

    await expect(
      service.getLiveState(userA1, { channelId: fixture.channelA2Id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getLiveState(userA1, { channelId: fixture.channelB1Id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getLiveState(userBNetwork, { channelId: fixture.channelA1Id }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('isolates create, update and read-receipt mutations', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const service = buildService(prisma);
    const userA1 = buildUser(fixture, 'A1');
    const userANetwork = buildUser(fixture, 'A_NETWORK');
    const userBNetwork = buildUser(fixture, 'B_NETWORK');

    const createdA1 = await service.createMessage(userA1, {
      channelId: fixture.channelA1Id,
      body: `PG team-chat fixture create A1 ${randomUUID()}`,
    });
    expect(createdA1).toMatchObject({
      channelId: fixture.channelA1Id,
      store: { id: fixture.storeA1Id },
    });

    const createdA2 = await service.createMessage(userANetwork, {
      channelId: fixture.channelA2Id,
      body: `PG team-chat fixture create A2 ${randomUUID()}`,
    });
    expect(createdA2).toMatchObject({
      channelId: fixture.channelA2Id,
      store: { id: fixture.storeA2Id },
    });

    await expect(
      service.createMessage(userA1, {
        channelId: fixture.channelA2Id,
        body: `PG team-chat fixture forbidden A2 ${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createMessage(userA1, {
        channelId: fixture.channelB1Id,
        body: `PG team-chat fixture forbidden B1 ${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateMessage(userBNetwork, fixture.messageA1Id, {
        isPinned: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.markRead(userA1, {
        channelId: fixture.channelB1Id,
        messageId: fixture.messageB1Id,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      await prisma.staffChatMessage.count({
        where: {
          tenantId: fixture.tenantBId,
          id: { in: [createdA1.id, createdA2.id] },
        },
      }),
    ).toBe(0);
  });

  it('rejects a stale JWT scope before any chat side effect', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const service = buildService(prisma);
    const staleUserA1 = buildUser(fixture, 'A1');
    const body = `PG team-chat fixture stale ${randomUUID()}`;

    await prisma.$transaction([
      prisma.userStoreAccess.deleteMany({
        where: { userId: fixture.userA1Id },
      }),
      prisma.userStoreAccess.create({
        data: {
          userId: fixture.userA1Id,
          storeId: fixture.storeA2Id,
        },
      }),
    ]);

    await expect(
      service.createMessage(staleUserA1, {
        channelId: fixture.channelA1Id,
        body,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.getReport(staleUserA1, { channelId: fixture.channelA1Id }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.getLiveState(staleUserA1, {
        channelId: fixture.channelA1Id,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(await prisma.staffChatMessage.count({ where: { body } })).toBe(0);
  });
});

function buildService(prisma: PrismaService) {
  const freshStoreScopeService = new FreshStoreScopeService(
    prisma,
    new AccessScopeService(),
  );
  const attachments = {
    bindPendingChatAttachments: jest.fn(),
  } as unknown as StaffAttachmentBindingsService;

  return new StaffTeamChatService(prisma, freshStoreScopeService, attachments);
}

function buildUser(
  fixture: Fixture,
  kind: 'A_NETWORK' | 'A1' | 'B_NETWORK',
): AuthenticatedUser {
  if (kind === 'A1') {
    return {
      id: fixture.userA1Id,
      email: `a1-${fixture.userA1Id}@team-chat.integration.invalid`,
      fullName: 'A1 manager',
      role: UserRole.CLUB_MANAGER,
      permissions: resolveUserCapabilities({ role: UserRole.CLUB_MANAGER }),
      isPlatformAdmin: false,
      tenantId: fixture.tenantAId,
      tenantSlug: fixture.tenantASlug,
      accessScope: 'STORES',
      allowedStoreIds: [fixture.storeA1Id],
    };
  }

  if (kind === 'B_NETWORK') {
    return {
      id: fixture.userBNetworkId,
      email: `b-network-${fixture.userBNetworkId}@team-chat.integration.invalid`,
      fullName: 'Tenant B owner',
      role: UserRole.OWNER,
      permissions: resolveUserCapabilities({ role: UserRole.OWNER }),
      isPlatformAdmin: false,
      tenantId: fixture.tenantBId,
      tenantSlug: fixture.tenantBSlug,
      accessScope: 'NETWORK',
      allowedStoreIds: [],
    };
  }

  return {
    id: fixture.userANetworkId,
    email: `a-network-${fixture.userANetworkId}@team-chat.integration.invalid`,
    fullName: 'Tenant A owner',
    role: UserRole.OWNER,
    permissions: resolveUserCapabilities({ role: UserRole.OWNER }),
    isPlatformAdmin: false,
    tenantId: fixture.tenantAId,
    tenantSlug: fixture.tenantASlug,
    accessScope: 'NETWORK',
    allowedStoreIds: [],
  };
}

async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const suffix = randomUUID();
  const fixture: Fixture = {
    tenantAId: randomUUID(),
    tenantASlug: `pilot-team-chat-a-${suffix}`,
    tenantBId: randomUUID(),
    tenantBSlug: `pilot-team-chat-b-${suffix}`,
    storeA1Id: randomUUID(),
    storeA2Id: randomUUID(),
    storeB1Id: randomUUID(),
    userANetworkId: randomUUID(),
    userA1Id: randomUUID(),
    userBNetworkId: randomUUID(),
    channelA1Id: randomUUID(),
    channelA2Id: randomUUID(),
    channelB1Id: randomUUID(),
    messageA1Id: randomUUID(),
    messageA2Id: randomUUID(),
    messageB1Id: randomUUID(),
  };

  await prisma.$transaction(async (tx) => {
    await tx.tenant.createMany({
      data: [
        {
          id: fixture.tenantAId,
          name: `Pilot team chat A ${suffix}`,
          slug: fixture.tenantASlug,
        },
        {
          id: fixture.tenantBId,
          name: `Pilot team chat B ${suffix}`,
          slug: fixture.tenantBSlug,
        },
      ],
    });
    await tx.store.createMany({
      data: [
        { id: fixture.storeA1Id, tenantId: fixture.tenantAId, name: 'A1' },
        { id: fixture.storeA2Id, tenantId: fixture.tenantAId, name: 'A2' },
        { id: fixture.storeB1Id, tenantId: fixture.tenantBId, name: 'B1' },
      ],
    });
    await tx.user.createMany({
      data: [
        {
          id: fixture.userANetworkId,
          tenantId: fixture.tenantAId,
          email: `a-network-${suffix}@team-chat.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Tenant A owner',
          role: UserRole.OWNER,
          accessScope: 'NETWORK',
        },
        {
          id: fixture.userA1Id,
          tenantId: fixture.tenantAId,
          email: `a1-${suffix}@team-chat.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'A1 manager',
          role: UserRole.CLUB_MANAGER,
          accessScope: 'STORES',
        },
        {
          id: fixture.userBNetworkId,
          tenantId: fixture.tenantBId,
          email: `b-network-${suffix}@team-chat.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Tenant B owner',
          role: UserRole.OWNER,
          accessScope: 'NETWORK',
        },
      ],
    });
    await tx.userStoreAccess.create({
      data: { userId: fixture.userA1Id, storeId: fixture.storeA1Id },
    });
    await tx.staffChatChannel.createMany({
      data: [
        {
          id: fixture.channelA1Id,
          tenantId: fixture.tenantAId,
          createdByUserId: fixture.userANetworkId,
          storeId: fixture.storeA1Id,
          name: `A1 ${suffix}`,
          scope: 'STORE',
        },
        {
          id: fixture.channelA2Id,
          tenantId: fixture.tenantAId,
          createdByUserId: fixture.userANetworkId,
          storeId: fixture.storeA2Id,
          name: `A2 ${suffix}`,
          scope: 'STORE',
        },
        {
          id: fixture.channelB1Id,
          tenantId: fixture.tenantBId,
          createdByUserId: fixture.userBNetworkId,
          storeId: fixture.storeB1Id,
          name: `B1 ${suffix}`,
          scope: 'STORE',
        },
      ],
    });
    await tx.staffChatMessage.createMany({
      data: [
        {
          id: fixture.messageA1Id,
          tenantId: fixture.tenantAId,
          channelId: fixture.channelA1Id,
          authorUserId: fixture.userANetworkId,
          storeId: fixture.storeA1Id,
          body: `PG team-chat fixture A1 ${suffix}`,
        },
        {
          id: fixture.messageA2Id,
          tenantId: fixture.tenantAId,
          channelId: fixture.channelA2Id,
          authorUserId: fixture.userANetworkId,
          storeId: fixture.storeA2Id,
          body: `PG team-chat fixture A2 ${suffix}`,
        },
        {
          id: fixture.messageB1Id,
          tenantId: fixture.tenantBId,
          channelId: fixture.channelB1Id,
          authorUserId: fixture.userBNetworkId,
          storeId: fixture.storeB1Id,
          body: `PG team-chat fixture B1 ${suffix}`,
        },
      ],
    });
  });

  return fixture;
}

function rememberFixture(tenantIds: Set<string>, fixture: Fixture) {
  tenantIds.add(fixture.tenantAId);
  tenantIds.add(fixture.tenantBId);
}

async function cleanupFixture(prisma: PrismaClient, tenantId: string) {
  await prisma.$transaction([
    prisma.staffChatReadReceipt.deleteMany({ where: { tenantId } }),
    prisma.staffChatMention.deleteMany({ where: { tenantId } }),
    prisma.staffChatMessageAttachment.deleteMany({ where: { tenantId } }),
    prisma.staffChatMessageEdit.deleteMany({ where: { tenantId } }),
    prisma.staffChatMessage.deleteMany({ where: { tenantId } }),
    prisma.staffChatChannelMember.deleteMany({ where: { tenantId } }),
    prisma.staffChatChannel.deleteMany({ where: { tenantId } }),
    prisma.userStoreAccess.deleteMany({ where: { user: { tenantId } } }),
    prisma.user.deleteMany({ where: { tenantId } }),
    prisma.store.deleteMany({ where: { tenantId } }),
    prisma.tenant.deleteMany({ where: { id: tenantId } }),
  ]);
}

function assertSafeIntegrationDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for Gate 1MT team-chat PostgreSQL fixtures',
    );
  }

  const parsed = new URL(databaseUrl);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const databaseName = parsed.pathname.replace(/^\/+/, '').toLowerCase();
  const schemaName = parsed.searchParams.get('schema')?.toLowerCase() ?? '';
  const safeDatabaseName = /(?:^|[_-])(ci|test)(?:$|[_-])/.test(databaseName);
  const safeTemporarySchema = /^pilot_team_chat_test_[a-z0-9_]+$/.test(
    schemaName,
  );

  if (
    !localHosts.has(parsed.hostname) ||
    (!safeDatabaseName && !safeTemporarySchema)
  ) {
    throw new Error(
      'Refusing team-chat fixtures outside a local CI/test database or isolated test schema',
    );
  }
}

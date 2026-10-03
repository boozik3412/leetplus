import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { SupportTicketsService } from './support-tickets.service';

describe('SupportTicketsService tenant boundaries', () => {
  function fixture(schemaBridgeMode = 'OFF') {
    const prisma = {
      guestSupportAttachment: { findFirst: jest.fn() },
      guestSupportTicket: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestSupportTicketAuditEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      user: { findFirst: jest.fn(), findMany: jest.fn() },
      userRoleOverride: { findUnique: jest.fn(), findMany: jest.fn() },
      tenant: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const tenantContext = {
      resolve: jest.fn(() => ({ tenantId: 'tenant-a' })),
    };
    const secretEncryption = {
      decrypt: jest.fn(),
    };
    const service = new SupportTicketsService(
      prisma as never,
      tenantContext as never,
      new ConfigService({
        GUEST_SUPPORT_SCHEMA_BRIDGE_MODE: schemaBridgeMode,
      }),
      secretEncryption as never,
    );
    return { service, prisma, secretEncryption };
  }

  function mockListDependencies(
    prisma: ReturnType<typeof fixture>['prisma'],
    row: Record<string, unknown>,
  ) {
    prisma.guestSupportTicket.findMany.mockResolvedValue([row]);
    prisma.guestSupportTicket.groupBy.mockResolvedValue([
      { status: 'NEW', _count: { _all: 1 } },
    ]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.userRoleOverride.findMany.mockResolvedValue([]);
    prisma.tenant.findMany.mockResolvedValue([]);
  }

  function supportTicketRow() {
    return {
      id: 'ticket-a',
      ticketNumber: 'LP-BUG-A1B2C3D4',
      tenantId: 'tenant-a',
      storeId: 'store-a',
      profileId: 'profile-a',
      guestId: 'guest-a',
      idempotencyKey: 'ticket-idempotency-key',
      topic: 'GAME_MODULE',
      description: 'Something did not work as expected.',
      status: 'NEW',
      tenant: { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a' },
      store: { id: 'store-a', name: 'Store A' },
      profile: {
        id: 'profile-a',
        displayName: 'I. P.',
        contactMasked: '***1234',
        phoneEncrypted: 'profile-phone-ciphertext',
        guest: {
          fullNameMasked: 'P. I.',
          fullNameEncrypted: 'current-name-ciphertext',
          phoneMasked: '***4321',
          phoneEncrypted: 'current-phone-ciphertext',
        },
      },
      guest: {
        fullNameMasked: 'I. P.',
        fullNameEncrypted: 'ticket-name-ciphertext',
        phoneMasked: '***1234',
        phoneEncrypted: 'ticket-phone-ciphertext',
      },
      assignedTo: null,
      attachments: [],
      comments: [],
      auditEvents: [],
    };
  }

  const actor = {
    id: 'user-a',
    tenantId: 'tenant-a',
    role: UserRole.ADMIN,
  } as never;

  function existingTicket(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ticket-a',
      tenantId: 'tenant-a',
      ticketNumber: 'LP-BUG-A1B2C3D4',
      status: 'NEW',
      assignedToUserId: null,
      updatedAt: new Date('2026-09-29T10:00:00.000Z'),
      ...overrides,
    };
  }

  function mockUpdateTransaction(
    prisma: ReturnType<typeof fixture>['prisma'],
    result: Record<string, unknown>,
    changedCount = 1,
  ) {
    const tx = {
      guestSupportTicket: {
        updateMany: jest.fn().mockResolvedValue({ count: changedCount }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'ticket-a',
          ticketNumber: 'LP-BUG-A1B2C3D4',
          updatedAt: new Date(),
          ...result,
        }),
      },
      guestSupportTicketAuditEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    );
    return tx;
  }

  it('fails closed before querying support tables during the CURRENT_187 bridge', () => {
    const { service, prisma } = fixture('ALLOW_CURRENT_187');

    expect(() => service.getPlatformTickets(actor, {})).toThrow(
      NotFoundException,
    );
    expect(() => service.getPlatformQueueSummary(actor)).toThrow(
      NotFoundException,
    );
    expect(prisma.guestSupportTicket.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('projects the full guest name and phone without returning encrypted fields', async () => {
    const { service, prisma, secretEncryption } = fixture();
    mockListDependencies(prisma, supportTicketRow());
    secretEncryption.decrypt.mockImplementation((value: string) => {
      if (value === 'ticket-name-ciphertext') return 'Ivan Petrov';
      if (value === 'profile-phone-ciphertext') return '79991234567';
      throw new Error('unexpected ciphertext');
    });

    const report = await service.getPlatformTickets(actor, {});

    expect(report.rows[0]?.profile).toEqual({
      id: 'profile-a',
      displayName: 'I. P.',
      contactMasked: '***1234',
      fullName: 'Ivan Petrov',
      phone: '79991234567',
    });
    expect(secretEncryption.decrypt).toHaveBeenCalledWith(
      'ticket-name-ciphertext',
      'pii',
    );
    expect(secretEncryption.decrypt).toHaveBeenCalledWith(
      'profile-phone-ciphertext',
      'pii',
    );
    expect(JSON.stringify(report.rows)).not.toContain('phoneEncrypted');
    expect(JSON.stringify(report.rows)).not.toContain('fullNameEncrypted');
    expect(JSON.stringify(report.rows)).not.toContain('ciphertext');
  });

  it('falls back to masked contact data and preserves the tenant boundary', async () => {
    const { service, prisma, secretEncryption } = fixture();
    const row = supportTicketRow();
    row.guest = null as never;
    mockListDependencies(prisma, row);
    secretEncryption.decrypt.mockImplementation(() => {
      throw new Error('damaged legacy value');
    });

    const report = await service.getTenantTickets(actor, {});

    expect(prisma.guestSupportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
    expect(report.rows[0]?.profile).toMatchObject({
      fullName: 'P. I.',
      phone: '***1234',
    });
  });

  it('includes tenant and ticket identity in every attachment lookup', async () => {
    const { service, prisma } = fixture();
    prisma.guestSupportAttachment.findFirst.mockResolvedValue({
      fileName: 'screen.png',
      contentType: 'image/png',
      byteSize: 3,
      data: Uint8Array.from([1, 2, 3]),
    });

    await expect(
      service.getTenantAttachment(actor, 'ticket-a', 'attachment-a'),
    ).resolves.toMatchObject({ fileName: 'screen.png', byteSize: 3 });
    expect(prisma.guestSupportAttachment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'attachment-a',
        ticketId: 'ticket-a',
        state: 'AVAILABLE',
        tenantId: 'tenant-a',
      },
      select: {
        fileName: true,
        contentType: true,
        byteSize: true,
        data: true,
      },
    });
  });

  it('returns not found instead of exposing a cross-tenant attachment', async () => {
    const { service, prisma } = fixture();
    prisma.guestSupportAttachment.findFirst.mockResolvedValue(null);

    await expect(
      service.getTenantAttachment(actor, 'ticket-b', 'attachment-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('checks the exact candidate role override when assigning a technician', async () => {
    const { service, prisma } = fixture();
    prisma.guestSupportTicket.findFirst.mockResolvedValue({
      id: 'ticket-a',
      tenantId: 'tenant-a',
      ticketNumber: 'LP-BUG-A1B2C3D4',
      status: 'NEW',
      assignedToUserId: null,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'technician-a',
      tenantId: 'tenant-a',
      fullName: 'Technician',
      email: 'tech@example.invalid',
      role: UserRole.MANAGER,
      isPlatformAdmin: false,
      customRole: null,
    });
    prisma.userRoleOverride.findUnique.mockResolvedValue({
      permissions: ['manage_support_tickets'],
    });
    mockUpdateTransaction(prisma, {
      status: 'IN_PROGRESS',
      assignedToUserId: 'technician-a',
    });

    await service.updateTenantTicket(actor, 'ticket-a', {
      status: 'IN_PROGRESS',
      assignedToUserId: 'technician-a',
    });

    expect(prisma.userRoleOverride.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_role: {
          tenantId: 'tenant-a',
          role: UserRole.MANAGER,
        },
      },
      select: { permissions: true },
    });
  });

  it('lists the active queue oldest first with unassigned and own filters', async () => {
    const { service, prisma } = fixture();
    mockListDependencies(prisma, supportTicketRow());

    await service.getTenantTickets(actor, {
      status: 'active',
      assignedToUserId: 'none',
    });
    await service.getTenantTickets(actor, {
      status: 'IN_PROGRESS',
      assignedToUserId: 'me',
    });
    await service.getTenantTickets(actor, { status: 'RESOLVED' });

    // Only the page queries are ordered; the auto-close sweep and the
    // "awaiting reply" lookup are not.
    const calls = (
      prisma.guestSupportTicket.findMany.mock.calls as Array<
        [{ orderBy?: unknown }]
      >
    )
      .map(([args]) => args)
      .filter((args) => args.orderBy);
    expect(calls[0]).toMatchObject({
      where: {
        tenantId: 'tenant-a',
        status: { in: ['NEW', 'IN_PROGRESS'] },
        assignedToUserId: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(calls[1]).toMatchObject({
      where: {
        tenantId: 'tenant-a',
        status: 'IN_PROGRESS',
        assignedToUserId: 'user-a',
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(calls[2]).toMatchObject({
      where: { tenantId: 'tenant-a', status: 'RESOLVED' },
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('reports unassigned, own and oldest waiting tickets in the summary', async () => {
    const { service, prisma } = fixture();
    mockListDependencies(prisma, supportTicketRow());
    prisma.guestSupportTicket.groupBy.mockResolvedValue([
      { status: 'NEW', _count: { _all: 3 } },
      { status: 'IN_PROGRESS', _count: { _all: 2 } },
      { status: 'CLOSED', _count: { _all: 4 } },
    ]);
    prisma.guestSupportTicket.count.mockImplementation(
      ({ where }: { where: { assignedToUserId: string | null } }) =>
        Promise.resolve(where.assignedToUserId === null ? 3 : 1),
    );
    prisma.guestSupportTicket.findFirst.mockResolvedValue({
      createdAt: new Date('2026-09-16T12:42:00.000Z'),
    });

    const report = await service.getTenantTickets(actor, {});

    expect(report.summary).toMatchObject({
      NEW: 3,
      IN_PROGRESS: 2,
      CLOSED: 4,
      active: 5,
      total: 9,
      unassigned: 3,
      mine: 1,
      oldestActiveCreatedAt: '2026-09-16T12:42:00.000Z',
    });
    expect(prisma.guestSupportTicket.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        status: { in: ['NEW', 'IN_PROGRESS'] },
        assignedToUserId: 'user-a',
      },
    });
  });

  it('returns a light queue summary with the newest unhandled ticket', async () => {
    const { service, prisma } = fixture();
    prisma.guestSupportTicket.groupBy.mockResolvedValue([
      { status: 'NEW', _count: { _all: 2 } },
    ]);
    prisma.guestSupportTicket.findFirst.mockImplementation(
      ({ where }: { where: { status?: unknown } }) =>
        Promise.resolve(
          where.status === 'NEW'
            ? {
                id: 'ticket-new',
                ticketNumber: 'LP-BUG-0000000A',
                topic: 'GAME_MODULE',
                createdAt: new Date('2026-09-29T09:53:00.000Z'),
                store: { name: 'Store A' },
                tenant: { name: 'Tenant A' },
              }
            : { createdAt: new Date('2026-09-28T09:00:00.000Z') },
        ),
    );

    const summary = await service.getTenantQueueSummary(actor);

    expect(summary).toEqual({
      scope: 'TENANT',
      NEW: 2,
      IN_PROGRESS: 0,
      active: 2,
      unassigned: 0,
      mine: 0,
      awaitingStaff: 0,
      oldestActiveCreatedAt: '2026-09-28T09:00:00.000Z',
      latestNew: {
        id: 'ticket-new',
        ticketNumber: 'LP-BUG-0000000A',
        topic: 'GAME_MODULE',
        createdAt: '2026-09-29T09:53:00.000Z',
        storeName: 'Store A',
        tenantName: 'Tenant A',
      },
    });
    expect(prisma.guestSupportTicket.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { tenantId: 'tenant-a', status: { in: ['NEW', 'IN_PROGRESS'] } },
      _count: { _all: true },
    });
  });

  it('offers platform support the club specialists of every network on the page', async () => {
    const { service, prisma } = fixture();
    mockListDependencies(prisma, {
      ...supportTicketRow(),
      tenantId: 'tenant-a',
    });
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'owner-a',
        tenantId: 'tenant-a',
        fullName: 'Owner A',
        email: 'owner@example.invalid',
        role: UserRole.OWNER,
        isPlatformAdmin: false,
        customRole: { permissions: [] },
      },
      {
        id: 'cashier-a',
        tenantId: 'tenant-a',
        fullName: 'Cashier A',
        email: 'cashier@example.invalid',
        role: UserRole.CLUB_MANAGER,
        isPlatformAdmin: false,
        customRole: null,
      },
    ]);

    const report = await service.getPlatformTickets(actor, {});

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          OR: [{ isPlatformAdmin: true }, { tenantId: { in: ['tenant-a'] } }],
        },
      }),
    );
    // OWNER keeps the support minimum even with a custom role.
    expect(report.users.map((user) => user.id)).toEqual(['owner-a']);
  });

  it('lets an OWNER with a custom role take a ticket', async () => {
    const { service, prisma } = fixture();
    prisma.guestSupportTicket.findFirst.mockResolvedValue(existingTicket());
    prisma.user.findFirst.mockResolvedValue({
      id: 'owner-a',
      tenantId: 'tenant-a',
      fullName: 'Owner A',
      email: 'owner@example.invalid',
      role: UserRole.OWNER,
      isPlatformAdmin: false,
      customRole: { permissions: [] },
    });
    const tx = mockUpdateTransaction(prisma, {
      status: 'IN_PROGRESS',
      assignedToUserId: 'owner-a',
    });

    await expect(
      service.updateTenantTicket(actor, 'ticket-a', {
        status: 'IN_PROGRESS',
        assignedToUserId: 'owner-a',
      }),
    ).resolves.toMatchObject({
      status: 'IN_PROGRESS',
      assignedToUserId: 'owner-a',
    });
    const [updateArgs] = tx.guestSupportTicket.updateMany.mock.calls[0] as [
      unknown,
    ];
    expect(updateArgs).toMatchObject({
      where: {
        id: 'ticket-a',
        tenantId: 'tenant-a',
        status: 'NEW',
        assignedToUserId: null,
      },
      data: {
        status: 'IN_PROGRESS',
        assignedToUserId: 'owner-a',
        resolvedAt: null,
        closedAt: null,
      },
    });
    const [auditArgs] = tx.guestSupportTicketAuditEvent.create.mock
      .calls[0] as [unknown];
    expect(auditArgs).toMatchObject({
      data: {
        action: 'UPDATED_BY_SUPPORT',
        metadata: {
          previousStatus: 'NEW',
          status: 'IN_PROGRESS',
          previousAssignedToUserId: null,
          assignedToUserId: 'owner-a',
        },
      },
    });
  });

  it('rejects a take when another specialist changed the ticket first', async () => {
    const { service, prisma } = fixture();
    prisma.guestSupportTicket.findFirst.mockResolvedValue(existingTicket());
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-a',
      tenantId: 'tenant-a',
      fullName: 'Admin A',
      email: 'admin@example.invalid',
      role: UserRole.ADMIN,
      isPlatformAdmin: false,
      customRole: null,
    });
    prisma.userRoleOverride.findUnique.mockResolvedValue(null);
    const tx = mockUpdateTransaction(prisma, {}, 0);

    await expect(
      service.updateTenantTicket(actor, 'ticket-a', {
        status: 'IN_PROGRESS',
        assignedToUserId: 'user-a',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.guestSupportTicketAuditEvent.create).not.toHaveBeenCalled();
  });

  it('does not rewrite timestamps or audit when nothing changes', async () => {
    const { service, prisma } = fixture();
    prisma.guestSupportTicket.findFirst.mockResolvedValue(
      existingTicket({ status: 'RESOLVED', assignedToUserId: 'user-a' }),
    );

    await expect(
      service.updateTenantTicket(actor, 'ticket-a', {
        status: 'RESOLVED',
        assignedToUserId: 'user-a',
      }),
    ).resolves.toMatchObject({
      status: 'RESOLVED',
      assignedToUserId: 'user-a',
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an assignee from another tenant', async () => {
    const { service, prisma } = fixture();
    prisma.guestSupportTicket.findFirst.mockResolvedValue({
      id: 'ticket-a',
      tenantId: 'tenant-a',
      ticketNumber: 'LP-BUG-A1B2C3D4',
      status: 'NEW',
      assignedToUserId: null,
    });
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.updateTenantTicket(actor, 'ticket-a', {
        assignedToUserId: 'foreign-user',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

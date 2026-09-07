import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { SupportTicketsService } from './support-tickets.service';

describe('SupportTicketsService tenant boundaries', () => {
  function fixture(schemaBridgeMode = 'OFF') {
    const prisma = {
      guestSupportAttachment: { findFirst: jest.fn() },
      guestSupportTicket: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
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

  it('fails closed before querying support tables during the CURRENT_187 bridge', () => {
    const { service, prisma } = fixture('ALLOW_CURRENT_187');

    expect(() => service.getPlatformTickets({})).toThrow(NotFoundException);
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

    const report = await service.getPlatformTickets({});

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
    prisma.$transaction.mockImplementation(
      (callback: (tx: any) => Promise<unknown>) =>
        callback({
          guestSupportTicket: {
            update: jest.fn().mockResolvedValue({
              id: 'ticket-a',
              ticketNumber: 'LP-BUG-A1B2C3D4',
              status: 'IN_PROGRESS',
              assignedToUserId: 'technician-a',
              updatedAt: new Date(),
            }),
          },
          guestSupportTicketAuditEvent: {
            create: jest.fn().mockResolvedValue({}),
          },
        }),
    );

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

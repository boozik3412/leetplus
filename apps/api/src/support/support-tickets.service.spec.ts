import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SupportTicketsService } from './support-tickets.service';

describe('SupportTicketsService tenant boundaries', () => {
  function fixture() {
    const prisma = {
      guestSupportAttachment: { findFirst: jest.fn() },
      guestSupportTicket: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
      userRoleOverride: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const tenantContext = {
      resolve: jest.fn(() => ({ tenantId: 'tenant-a' })),
    };
    const service = new SupportTicketsService(
      prisma as never,
      tenantContext as never,
    );
    return { service, prisma };
  }

  const actor = {
    id: 'user-a',
    tenantId: 'tenant-a',
    role: UserRole.ADMIN,
  } as never;

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

import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { GuestsService } from './guests.service';

const networkUser: AuthenticatedUser = {
  id: 'user-a',
  email: 'user-a@example.test',
  fullName: 'Network A owner',
  role: UserRole.OWNER,
  isPlatformAdmin: false,
  tenantId: 'tenant-a',
  tenantSlug: 'tenant-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
};

describe('Guest CRM communications tenant boundary', () => {
  const guestCrmTaskFindMany = jest.fn();
  const guestCrmTaskFindFirst = jest.fn();
  const guestCrmTaskCreate = jest.fn();
  const guestCrmTaskUpdate = jest.fn();
  const guestFindFirst = jest.fn();
  const guestCrmLeadFindFirst = jest.fn();
  const guestCrmContactEventFindMany = jest.fn();
  const guestCrmContactEventCreate = jest.fn();
  const userFindMany = jest.fn();
  const userFindFirst = jest.fn();
  const resolveTenant = jest.fn();
  let service: GuestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveTenant.mockResolvedValue({
      tenantId: 'tenant-a',
      tenantSlug: 'tenant-a',
    });
    guestCrmTaskFindMany.mockResolvedValue([]);
    guestCrmContactEventFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([]);

    service = new GuestsService(
      {
        guestCrmTask: {
          findMany: guestCrmTaskFindMany,
          findFirst: guestCrmTaskFindFirst,
          create: guestCrmTaskCreate,
          update: guestCrmTaskUpdate,
        },
        guest: { findFirst: guestFindFirst },
        guestCrmLead: { findFirst: guestCrmLeadFindFirst },
        guestCrmContactEvent: {
          findMany: guestCrmContactEventFindMany,
          create: guestCrmContactEventCreate,
        },
        user: { findMany: userFindMany, findFirst: userFindFirst },
      } as never,
      { resolve: resolveTenant },
      null as never,
      null as never,
      null as never,
      null as never,
    );
  });

  it('anchors every contact-task read selector to the authenticated tenant', async () => {
    await service.getGuestCrmTaskReport(networkUser);
    await service.getGuestCrmUsers(networkUser);
    await service.getGuestCrmContactEvents(networkUser);

    expect(guestCrmTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', status: 'OPEN' },
      }),
    );
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', isActive: true },
      }),
    );
    expect(guestCrmContactEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
  });

  it('denies cross-tenant task targets before creating a row', async () => {
    guestFindFirst.mockResolvedValue(null);

    await expect(
      service.createGuestCrmTask(networkUser, { guestId: 'guest-b' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(guestFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'guest-b', tenantId: 'tenant-a' },
      }),
    );
    expect(guestCrmTaskCreate).not.toHaveBeenCalled();
  });

  it('denies cross-tenant contact targets before creating a row', async () => {
    guestCrmLeadFindFirst.mockResolvedValue(null);

    await expect(
      service.createGuestCrmContactEvent(networkUser, {
        channel: 'phone',
        leadId: 'lead-b',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(guestCrmLeadFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-b', tenantId: 'tenant-a' },
      }),
    );
    expect(guestCrmContactEventCreate).not.toHaveBeenCalled();
  });

  it('denies a cross-tenant task id and never reaches the mutation', async () => {
    guestCrmTaskFindFirst.mockResolvedValue(null);

    await expect(
      service.updateGuestCrmTask(networkUser, 'task-b', { status: 'DONE' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(guestCrmTaskFindFirst).toHaveBeenCalledWith({
      where: { id: 'task-b', tenantId: 'tenant-a' },
      select: { id: true, status: true, completedAt: true },
    });
    expect(guestCrmTaskUpdate).not.toHaveBeenCalled();
  });
});

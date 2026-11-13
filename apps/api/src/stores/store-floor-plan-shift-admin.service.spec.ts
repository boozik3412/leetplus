import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { StaffChecklistsService } from '../staff/staff-checklists.service';
import type { StaffTasksService } from '../staff/staff-tasks.service';
import type { StoreFloorPlanLiveService } from './store-floor-plan-live.service';
import { StoreFloorPlanShiftAdminService } from './store-floor-plan-shift-admin.service';

describe('StoreFloorPlanShiftAdminService («Режим администратора смены»)', () => {
  const NOW = new Date('2026-11-13T10:00:00.000Z');
  const viewer = (role: string, id = 'user-senior') =>
    ({
      id,
      tenantId: 'tenant-demo',
      role,
      isPlatformAdmin: false,
      capabilities: [],
    }) as unknown as AuthenticatedUser;
  const shiftOf = (
    admin: { name: string | null; userId: string | null } | null,
    extra: Record<string, unknown> = {},
  ) => ({
    store: { id: 'store-kh', tenantId: 'tenant-demo' },
    status: 'LIVE',
    startedAt: '2026-11-13T06:00:00.000Z',
    admin,
    failed: false,
    ...extra,
  });
  let live: { shiftAdminOf: jest.Mock };
  let checklists: { getShiftAdminRuns: jest.Mock };
  let tasks: { getShiftAdminTasks: jest.Mock };
  let service: StoreFloorPlanShiftAdminService;

  beforeEach(() => {
    live = {
      shiftAdminOf: jest
        .fn()
        .mockResolvedValue(
          shiftOf({ name: 'Иванова Мария', userId: 'user-admin' }),
        ),
    };
    checklists = {
      getShiftAdminRuns: jest.fn().mockResolvedValue([{ id: 'run-1' }]),
    };
    tasks = {
      getShiftAdminTasks: jest
        .fn()
        .mockResolvedValue({ rows: [{ id: 'task-1' }], total: 3 }),
    };
    service = new StoreFloorPlanShiftAdminService(
      live as unknown as StoreFloorPlanLiveService,
      checklists as unknown as StaffChecklistsService,
      tasks as unknown as StaffTasksService,
    );
  });

  it('reads the checklist and tasks of the shift administrator', async () => {
    const work = await service.getShiftAdminWork(
      'store-kh',
      viewer('SENIOR_ADMINISTRATOR'),
      NOW,
    );

    expect(work).toMatchObject({
      storeId: 'store-kh',
      state: 'READY',
      admin: { name: 'Иванова Мария', userId: 'user-admin', isMe: false },
      checklists: [{ id: 'run-1' }],
      tasks: [{ id: 'task-1' }],
      taskTotal: 3,
    });
    expect(checklists.getShiftAdminRuns).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-senior' }),
      'store-kh',
      'user-admin',
      NOW,
    );
    expect(tasks.getShiftAdminTasks).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-senior' }),
      'store-kh',
      'user-admin',
    );
  });

  it('refuses a club administrator and keeps Langame unread', async () => {
    await expect(
      service.getShiftAdminWork('store-kh', viewer('CLUB_ADMINISTRATOR'), NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getShiftAdminWork('store-kh', viewer('MARKETER'), NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(live.shiftAdminOf).not.toHaveBeenCalled();
  });

  it('passes on a club outside the viewer scope', async () => {
    live.shiftAdminOf.mockRejectedValue(
      new NotFoundException('Клуб не найден'),
    );
    await expect(
      service.getShiftAdminWork('store-kh', viewer('STANDARDS_MANAGER'), NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('says when the Langame administrator has no LeetPlus account', async () => {
    live.shiftAdminOf.mockResolvedValue(
      shiftOf({ name: 'admin_kh', userId: null }),
    );
    const work = await service.getShiftAdminWork(
      'store-kh',
      viewer('OWNER'),
      NOW,
    );

    expect(work).toMatchObject({
      state: 'NOT_LINKED',
      admin: { name: 'admin_kh' },
      checklists: null,
      tasks: null,
    });
    expect(checklists.getShiftAdminRuns).not.toHaveBeenCalled();
  });

  it('tells no open shift from a Langame failure', async () => {
    live.shiftAdminOf.mockResolvedValue(shiftOf(null, { startedAt: null }));
    await expect(
      service.getShiftAdminWork('store-kh', viewer('MANAGER'), NOW),
    ).resolves.toMatchObject({ state: 'NO_SHIFT', admin: null });

    live.shiftAdminOf.mockResolvedValue(shiftOf(null, { failed: true }));
    await expect(
      service.getShiftAdminWork('store-kh', viewer('MANAGER'), NOW),
    ).resolves.toMatchObject({ state: 'UNAVAILABLE' });
  });

  it('keeps the tasks when the checklists are not allowed', async () => {
    checklists.getShiftAdminRuns.mockRejectedValue(
      new ForbiddenException('Checklist access is not allowed'),
    );
    const work = await service.getShiftAdminWork(
      'store-kh',
      viewer('CLUB_MANAGER'),
      NOW,
    );

    expect(work).toMatchObject({
      state: 'READY',
      checklists: null,
      checklistAccess: 'NO_CAPABILITY',
      tasks: [{ id: 'task-1' }],
      taskAccess: 'AVAILABLE',
    });
  });

  it('marks the viewer who holds the shift', async () => {
    const work = await service.getShiftAdminWork(
      'store-kh',
      viewer('SENIOR_ADMINISTRATOR', 'user-admin'),
      NOW,
    );
    expect(work.admin).toEqual({
      name: 'Иванова Мария',
      userId: 'user-admin',
      isMe: true,
    });
  });
});

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StaffPrioritiesService } from './staff-priorities.service';

const user: AuthenticatedUser = {
  id: 'manager',
  email: 'manager@example.test',
  fullName: null,
  role: UserRole.MANAGER,
  isPlatformAdmin: false,
  tenantId: 'tenant-a',
  tenantSlug: 'tenant-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
  permissions: [
    'view_staff_control',
    'view_staff_tasks',
    'view_staff_standards',
    'view_staff_training',
    'manage_staff_training',
  ],
};
const course = (
  id: string,
  storeId: string | null = null,
  status = 'NOT_STARTED',
) => ({
  id,
  title: id,
  required: true,
  store: storeId ? { id: storeId } : null,
  progress: { status },
});
const employee = (
  id: string,
  storeIds = ['a'],
  courses = [course('course')],
  accessScope = 'STORES',
  isActive = true,
) => ({
  user: {
    id,
    fullName: id,
    email: `${id}@example.test`,
    accessScope,
    isActive,
    stores: storeIds.map((storeId) => ({ id: storeId, name: storeId })),
  },
  courses,
  regulations: [
    {
      id: 'regulation',
      title: 'Правила',
      version: 2,
      store: null,
      acknowledged: false,
    },
  ],
});
type QueryArgs = { where: Record<string, unknown> };
function fixture() {
  const prisma = {
    store: {
      findMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
    },
    staffTask: {
      count: jest.fn<Promise<number>, [QueryArgs]>().mockResolvedValue(6001),
      findMany: jest
        .fn<Promise<unknown[]>, [QueryArgs]>()
        .mockResolvedValue([]),
    },
    staffChecklistRun: {
      count: jest.fn<Promise<number>, [QueryArgs]>().mockResolvedValue(2),
      findMany: jest
        .fn<Promise<unknown[]>, [QueryArgs]>()
        .mockResolvedValue([]),
    },
  };
  const scope = {
    assertNetwork: jest.fn().mockResolvedValue({}),
    resolveRequestedStoreIds: jest
      .fn()
      .mockImplementation((_user: AuthenticatedUser, ids?: readonly string[]) =>
        Promise.resolve({
          tenantId: 'tenant-a',
          effectiveStoreIds: ids ?? null,
        }),
      ),
  };
  const report = {
    rows: [
      employee('alice'),
      employee('bob', ['b']),
      employee('network', [], [course('global')], 'NETWORK'),
      employee('inactive', ['a'], [course('old')], 'STORES', false),
    ],
    priorityCoverage: {
      employeesComplete: true,
      coursesComplete: true,
      regulationsComplete: true,
    },
  };
  const profiles = { getProfiles: jest.fn().mockResolvedValue(report) };
  const readiness = { getReport: jest.fn().mockResolvedValue(report) };
  const service = new StaffPrioritiesService(
    prisma as never,
    scope as never,
    profiles as never,
    readiness as never,
  );
  return { prisma, scope, report, profiles, readiness, service };
}

describe('current staff priorities', () => {
  it('counts beyond legacy report caps and matches canonical unfinished statuses', async () => {
    const { service, prisma } = fixture();
    const summary = await service.getSummary(user, { storeIds: ['a'] });
    expect(summary.metrics.TASKS_OVERDUE.value).toBe(6001);
    expect(prisma.staffTask.findMany).not.toHaveBeenCalled();
    expect(prisma.staffTask.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        OR: [{ storeId: { in: ['a'] } }],
        status: { notIn: ['DONE', 'CANCELED'] },
        dueAt: { lt: expect.any(Date) as unknown },
      }) as unknown,
    });
    expect(
      prisma.staffChecklistRun.count.mock.calls.map(
        (call) => (call[0].where.status as { in: string[] }).in,
      ),
    ).toEqual([
      ['OPEN', 'IN_PROGRESS', 'RETURNED', 'ESCALATED'],
      ['ON_REVIEW'],
    ]);
  });
  it('keeps current server time separate from a supplied financial period', async () => {
    const { service, prisma } = fixture();
    const before = Date.now();
    const summary = await service.getSummary(user, {
      storeIds: 'a',
      dateFrom: '1999-01-01',
      asOf: '1999-01-01',
    } as never);
    expect(new Date(summary.evaluatedAt).getTime()).toBeGreaterThanOrEqual(
      before,
    );
    expect(
      (
        prisma.staffTask.count.mock.calls[0][0].where.dueAt as { lt: Date }
      ).lt.toISOString(),
    ).toBe(summary.evaluatedAt);
  });
  it('filters employee and material scopes, includes network assignments only for the full active network', async () => {
    const { service, report } = fixture();
    report.rows[0].courses.push(
      course('foreign', 'b'),
      course('done', 'a', 'COMPLETED'),
      course('waived', 'a', 'WAIVED'),
    );
    const subset = await service.getItems(user, {
      storeIds: 'a',
      kind: 'TRAINING_INCOMPLETE',
    });
    expect(subset.items.map((row) => row.id)).toEqual(['alice']);
    expect(subset.items[0].missingCourses?.map((row) => row.id)).toEqual([
      'course',
    ]);
    expect(subset.scope.includesNetworkAssignments).toBe(false);
    const network = await service.getSummary(user, { storeIds: ['a', 'b'] });
    expect(network.metrics.TRAINING_INCOMPLETE.value).toBe(3);
    expect(network.scope.includesNetworkAssignments).toBe(true);
  });
  it('never claims zero when employee or course catalogs are capped; positive gaps remain lower bounds', async () => {
    const { service, report } = fixture();
    report.priorityCoverage.employeesComplete = false;
    expect(
      (await service.getSummary(user, { storeIds: 'a' })).metrics
        .TRAINING_INCOMPLETE,
    ).toMatchObject({
      state: 'PARTIAL',
      value: 1,
      coverage: { total: null, limitCodes: ['EMPLOYEES_LIMIT'] },
    });
    report.rows = [];
    expect(
      (await service.getSummary(user, { storeIds: 'a' })).metrics
        .TRAINING_INCOMPLETE,
    ).toMatchObject({ state: 'UNAVAILABLE', value: null });
    report.priorityCoverage.employeesComplete = true;
    expect(
      (await service.getSummary(user, { storeIds: 'a' })).metrics
        .TRAINING_INCOMPLETE,
    ).toMatchObject({ state: 'AVAILABLE', value: 0 });
  });
  it('counts employees once and retains the exact pending regulation version', async () => {
    const { service, report } = fixture();
    report.rows[0].regulations.push({
      id: 'acked',
      title: 'Прочитано',
      version: 1,
      store: null,
      acknowledged: true,
    });
    const detail = await service.getItems(user, {
      storeIds: 'a',
      kind: 'REGULATIONS_UNACKNOWLEDGED',
    });
    expect(detail.metric.value).toBe(1);
    expect(detail.items[0].missingRegulations).toEqual([
      { id: 'regulation', title: 'Правила', version: 2 },
    ]);
  });
  it('does not fetch hidden features or substitute a self-only learning profile', async () => {
    const { service, prisma, profiles, readiness } = fixture();
    const restricted = {
      ...user,
      permissions: ['view_staff_control'] as AuthenticatedUser['permissions'],
    };
    const summary = await service.getSummary(restricted, { storeIds: 'a' });
    expect(
      Object.values(summary.metrics).every(
        (metric) => metric.value === null && metric.state === 'UNAVAILABLE',
      ),
    ).toBe(true);
    expect(prisma.staffTask.count).not.toHaveBeenCalled();
    expect(profiles.getProfiles).not.toHaveBeenCalled();
    expect(readiness.getReport).not.toHaveBeenCalled();
  });
  it('rejects stale or forbidden scope before reading business records', async () => {
    const { service, scope, prisma } = fixture();
    scope.assertNetwork.mockRejectedValueOnce(new UnauthorizedException());
    await expect(service.getSummary(user)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    scope.resolveRequestedStoreIds.mockRejectedValueOnce(
      new ForbiddenException(),
    );
    await expect(
      service.getSummary(user, { storeIds: 'foreign' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.staffTask.count).not.toHaveBeenCalled();
  });
  it('preserves unaffected sources when a task read fails', async () => {
    const { service, prisma } = fixture();
    prisma.staffTask.count.mockRejectedValue(new Error('offline'));
    const summary = await service.getSummary(user, { storeIds: 'a' });
    expect(summary.metrics.TASKS_OVERDUE).toMatchObject({
      state: 'FAILED',
      value: null,
    });
    expect(summary.metrics.CHECKLISTS_OVERDUE).toMatchObject({
      state: 'AVAILABLE',
      value: 2,
    });
  });
  it('pages the same predicate and rejects cursor reuse for another club or kind', async () => {
    const { service, prisma } = fixture();
    prisma.staffTask.findMany.mockResolvedValue([
      {
        id: '01',
        title: 'One',
        status: 'OPEN',
        dueAt: new Date(),
        store: null,
        assignedToUser: null,
      },
      {
        id: '02',
        title: 'Two',
        status: 'OPEN',
        dueAt: new Date(),
        store: null,
        assignedToUser: null,
      },
    ] as never);
    const first = await service.getItems(user, {
      storeIds: 'a',
      kind: 'TASKS_OVERDUE',
      limit: '1',
    });
    expect(first.items).toHaveLength(1);
    expect(first.page.hasMore).toBe(true);
    await expect(
      service.getItems(user, {
        storeIds: 'b',
        kind: 'TASKS_OVERDUE',
        cursor: first.page.nextCursor!,
      }),
    ).rejects.toThrow('Invalid priority cursor');
    await service.getItems(user, {
      storeIds: 'a',
      kind: 'TASKS_OVERDUE',
      cursor: first.page.nextCursor!,
    });
    expect(prisma.staffTask.findMany.mock.calls[1][0].where).toMatchObject({
      tenantId: 'tenant-a',
      OR: [{ storeId: { in: ['a'] } }],
      id: { gt: '01' },
      status: { notIn: ['DONE', 'CANCELED'] },
    });
    await expect(
      service.getItems(user, { kind: 'TASKS_OVERDUE', limit: '1000' }),
    ).rejects.toThrow('Invalid page limit');
  });
});

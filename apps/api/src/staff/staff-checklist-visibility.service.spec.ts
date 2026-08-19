import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StaffChecklistAccessPolicyService } from './staff-checklist-access-policy.service';
import { StaffChecklistsService } from './staff-checklists.service';
import { StaffChecklistTemplatesService } from './staff-checklist-templates.service';

describe('Staff checklist catalog visibility', () => {
  const tenantId = 'tenant-1';
  const storeId = 'store-1';
  const now = new Date('2026-06-10T08:00:00.000Z');
  const sections = [
    {
      id: 'section-1',
      title: 'Открытие смены',
      description: null,
      items: [
        {
          id: 'item-1',
          title: 'Проверить стойку',
          instruction: null,
          valueType: 'CHECKBOX',
          required: true,
          evidenceRequired: false,
          score: 1,
        },
      ],
    },
  ];

  function actor(role: UserRole): AuthenticatedUser {
    return {
      id: 'user-1',
      email: 'admin@example.com',
      fullName: 'Тестовый администратор',
      role,
      tenantId,
      tenantSlug: 'demo',
      isActive: true,
      isPlatformAdmin: false,
      accessScope: 'STORES',
      allowedStoreIds: [storeId],
      permissions: ['view_staff_standards'],
    };
  }

  it('shows active checklist templates to administrators by role and club', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          storeAccesses: [{ storeId }],
        }),
      },
      staffChecklistTemplate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'template-1',
            title: 'Дневной чек-лист',
            description: null,
            shiftKind: 'OPENING',
            roleScope: 'ADMINISTRATOR',
            status: 'ACTIVE',
            version: 1,
            sections,
            sectionsCount: 1,
            itemsCount: 1,
            requiredItemsCount: 1,
            evidenceItemsCount: 0,
            scoreTotal: 1,
            createdAt: now,
            updatedAt: now,
            store: { id: storeId, name: '1337 Радищева', isActive: true },
            sourceRegulation: null,
            createdByUser: null,
          },
        ]),
      },
      store: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffShiftRegulation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const accessPolicy = new StaffChecklistAccessPolicyService({
      resolve: jest.fn().mockResolvedValue({
        userId: 'user-1',
        tenantId,
        tenantSlug: 'demo',
        mode: 'STORES',
        allowedStoreIds: [storeId],
      }),
    } as never);
    const service = new StaffChecklistTemplatesService(
      prisma as never,
      accessPolicy,
    );

    const report = await service.getTemplates(
      actor(UserRole.CLUB_ADMINISTRATOR),
      {
        status: 'all',
      },
    );

    expect(report.filters.status).toBe('ACTIVE');
    expect(report.rows).toHaveLength(1);
    expect(prisma.staffChecklistTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { tenantId, status: 'ACTIVE' },
            {
              OR: [
                {
                  storeId: { in: [storeId] },
                  status: 'ACTIVE',
                  roleScope: { in: ['ADMINISTRATOR', 'ALL_STAFF'] },
                },
                {
                  storeId: null,
                  status: 'ACTIVE',
                  roleScope: { in: ['ADMINISTRATOR', 'ALL_STAFF'] },
                },
              ],
            },
          ],
        },
      }),
    );
  });

  it('returns checklist source options to shift roles without opening the builder', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          storeAccesses: [{ storeId }],
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-1',
            email: 'admin@example.com',
            fullName: 'Тестовый администратор',
          },
        ]),
      },
      staffChecklistRun: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffShiftRegulation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'regulation-1',
            title: 'Регламент дневной смены',
            shiftKind: 'OPENING',
            roleScope: 'ADMINISTRATOR',
            version: 1,
            sections,
            store: { id: storeId, name: '1337 Радищева', isActive: true },
          },
        ]),
      },
      staffChecklistTemplate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'template-1',
            title: 'Дневной чек-лист',
            shiftKind: 'OPENING',
            roleScope: 'ADMINISTRATOR',
            status: 'ACTIVE',
            version: 1,
            sections,
            store: { id: storeId, name: '1337 Радищева', isActive: true },
          },
        ]),
      },
      store: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const accessPolicy = new StaffChecklistAccessPolicyService({
      resolve: jest.fn().mockResolvedValue({
        userId: 'user-1',
        tenantId,
        tenantSlug: 'demo',
        mode: 'STORES',
        allowedStoreIds: [storeId],
      }),
    } as never);
    const service = new StaffChecklistsService(
      prisma as never,
      accessPolicy,
      {} as never,
    );

    const report = await service.getChecklists(
      actor(UserRole.CLUB_ADMINISTRATOR),
    );

    expect(report.publishedRegulations).toHaveLength(1);
    expect(report.checklistTemplates).toHaveLength(1);
    expect(prisma.staffChecklistTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          AND: [
            {
              OR: [
                {
                  storeId: { in: [storeId] },
                  status: 'ACTIVE',
                  roleScope: { in: ['ADMINISTRATOR', 'ALL_STAFF'] },
                },
                {
                  storeId: null,
                  status: 'ACTIVE',
                  roleScope: { in: ['ADMINISTRATOR', 'ALL_STAFF'] },
                },
              ],
            },
          ],
        },
      }),
    );
  });
});

describe('Staff checklist time-of-day planning', () => {
  function createService() {
    return new StaffChecklistsService({} as never, {} as never, {} as never);
  }

  function resolveTimeOfDayPlannedAt(
    service: StaffChecklistsService,
    base: Date,
    timeOfDay: string,
  ) {
    const [hours, minutes] = timeOfDay.split(':').map(Number);

    return (
      service as unknown as {
        resolveTimeOfDayPlannedAt: (
          base: Date,
          hours: number,
          minutes: number,
          timeZone: string,
        ) => Date | null;
      }
    ).resolveTimeOfDayPlannedAt(base, hours, minutes, 'Asia/Yekaterinburg');
  }

  it('keeps overnight checklist items on the closest local shift date', () => {
    const service = createService();
    const shiftStartedAt = new Date('2026-07-19T17:00:00.000Z');

    expect(
      resolveTimeOfDayPlannedAt(
        service,
        shiftStartedAt,
        '23:00',
      )?.toISOString(),
    ).toBe('2026-07-19T18:00:00.000Z');
    expect(
      resolveTimeOfDayPlannedAt(
        service,
        shiftStartedAt,
        '00:00',
      )?.toISOString(),
    ).toBe('2026-07-19T19:00:00.000Z');
    expect(
      resolveTimeOfDayPlannedAt(
        service,
        shiftStartedAt,
        '01:00',
      )?.toISOString(),
    ).toBe('2026-07-19T20:00:00.000Z');
  });

  it('does not mark a midnight task late by a day in an overnight shift', () => {
    const service = createService();
    const shiftStartedAt = new Date('2026-07-19T17:00:00.000Z');
    const item = {
      id: 'item-midnight',
      title: 'Midnight check',
      instruction: null,
      valueType: 'CHECKBOX',
      required: true,
      evidenceRequired: false,
      score: 1,
      timing: {
        mode: 'TIME_OF_DAY',
        offsetMinutes: null,
        timeOfDay: '00:00',
        toleranceMinutes: 30,
        affectsDiscipline: true,
      },
    } as const;
    const row = {
      status: 'IN_PROGRESS',
      scheduledAt: null,
      startedAt: shiftStartedAt,
      createdAt: shiftStartedAt,
      sectionsSnapshot: [],
      answers: [],
      store: {
        city: 'Ekaterinburg',
        address: null,
        timeZone: 'Asia/Yekaterinburg',
      },
      shift: {
        startedAt: shiftStartedAt,
        stoppedAt: null,
        store: null,
      },
    };
    const answer = {
      sectionId: 'section-1',
      itemId: item.id,
      value: 'done',
      status: 'PASS',
      note: null,
      evidenceUrl: null,
      evidenceAttachments: [],
      reviewThreads: [],
      completedAt: '2026-07-19T19:17:00.000Z',
      timing: null,
    };
    const timing = (
      service as unknown as {
        evaluateAnswerTiming: (
          row: typeof row,
          item: typeof item,
          answer: typeof answer,
        ) => {
          status: string;
          plannedAt: string | null;
          deviationMinutes: number | null;
        } | null;
      }
    ).evaluateAnswerTiming(row, item, answer);

    expect(timing).toEqual(
      expect.objectContaining({
        status: 'ON_TIME',
        plannedAt: '2026-07-19T19:00:00.000Z',
        deviationMinutes: 17,
      }),
    );
  });

  it('uses the server timestamp instead of a timestamp sent by the device', () => {
    const service = createService();
    const sections = [
      {
        id: 'section-1',
        title: 'Section',
        description: null,
        items: [
          {
            id: 'item-1',
            title: 'Item',
            instruction: null,
            valueType: 'CHECKBOX',
            required: true,
            evidenceRequired: false,
            score: 1,
            timing: {
              mode: 'NONE',
              offsetMinutes: null,
              timeOfDay: null,
              toleranceMinutes: 0,
              affectsDiscipline: false,
            },
          },
        ],
      },
    ] as const;
    const serverCompletedAt = '2026-07-19T19:17:00.000Z';
    const answers = (
      service as unknown as {
        normalizeAnswers: (
          value: unknown,
          sections: typeof sections,
          options: { serverCompletedAt: string },
        ) => Array<{ completedAt: string | null }>;
      }
    ).normalizeAnswers(
      [
        {
          sectionId: 'section-1',
          itemId: 'item-1',
          status: 'PASS',
          completedAt: '1999-01-01T00:00:00.000Z',
        },
      ],
      sections,
      { serverCompletedAt },
    );

    expect(answers[0]?.completedAt).toBe(serverCompletedAt);
  });
});

import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
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
    const service = new StaffChecklistTemplatesService(
      prisma as never,
      { resolve: jest.fn().mockResolvedValue({ tenantId }) } as never,
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
              roleScope: { in: ['ADMINISTRATOR', 'ALL_STAFF'] },
              OR: [{ storeId: null }, { storeId: { in: [storeId] } }],
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
    const service = new StaffChecklistsService(
      prisma as never,
      { resolve: jest.fn().mockResolvedValue({ tenantId }) } as never,
    );

    const report = await service.getChecklists(
      actor(UserRole.CLUB_ADMINISTRATOR),
    );

    expect(report.publishedRegulations).toHaveLength(1);
    expect(report.checklistTemplates).toHaveLength(1);
    expect(prisma.staffChecklistTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { tenantId, status: 'ACTIVE' },
            {
              roleScope: { in: ['ADMINISTRATOR', 'ALL_STAFF'] },
              OR: [{ storeId: null }, { storeId: { in: [storeId] } }],
            },
          ],
        },
      }),
    );
  });
});

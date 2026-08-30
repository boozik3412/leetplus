import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StaffChecklistsService } from './staff-checklists.service';

describe('Staff checklist review decisions', () => {
  const tenantId = 'tenant-1';
  const runId = 'run-1';
  const attachmentId = '96735ada-456d-4001-bc16-e011ab48a790';
  const now = new Date('2026-08-22T04:18:00.000Z');
  const legacyUrl = `https://localhost:3000/api/staff/attachments/${attachmentId}`;
  const sections = [
    {
      id: 'section-1',
      title: 'Дневная смена',
      description: null,
      items: [
        {
          id: 'item-1',
          title: 'Проверить рабочее место',
          instruction: null,
          valueType: 'CHECKBOX',
          required: true,
          evidenceRequired: true,
          score: 1,
        },
      ],
    },
  ];
  const storedAnswers = [
    {
      sectionId: 'section-1',
      itemId: 'item-1',
      value: 'done',
      status: 'PASS',
      note: 'Ответ сотрудника',
      evidenceUrl: legacyUrl,
      evidenceAttachments: [
        {
          id: attachmentId,
          fileName: 'evidence.jpg',
          contentType: 'image/jpeg',
          byteSize: 174_674,
          url: legacyUrl,
          createdAt: '2026-08-21T04:05:00.000Z',
        },
      ],
      reviewThreads: [],
      completedAt: '2026-08-21T04:05:00.000Z',
    },
  ];

  function reviewer(): AuthenticatedUser {
    return {
      id: 'standards-manager-1',
      email: 'standards@example.com',
      fullName: 'Менеджер по стандартам',
      role: UserRole.STANDARDS_MANAGER,
      isPlatformAdmin: false,
      tenantId,
      tenantSlug: 'demo',
      accessScope: 'NETWORK',
      allowedStoreIds: [],
    };
  }

  function run(status: 'ON_REVIEW' | 'ACCEPTED') {
    return {
      id: runId,
      tenantId,
      regulationId: null,
      templateId: 'template-1',
      storeId: 'store-1',
      shiftId: null,
      createdByUserId: 'employee-1',
      assignedToUserId: 'employee-1',
      reviewedByUserId: status === 'ACCEPTED' ? 'standards-manager-1' : null,
      title: 'Чек-лист дневной смены администратора: выполнение',
      shiftKind: 'CUSTOM',
      roleScope: 'ADMINISTRATOR',
      status,
      regulationVersion: 0,
      templateVersion: 1,
      scheduledAt: null,
      startedAt: now,
      submittedAt: now,
      reviewedAt: status === 'ACCEPTED' ? now : null,
      sectionsSnapshot: sections,
      answers: storedAnswers,
      scoreTotal: 1,
      scoreEarned: 1,
      requiredItemsTotal: 1,
      requiredItemsDone: 1,
      evidenceTotal: 1,
      evidenceDone: 1,
      failedItems: 0,
      blockingIssues: [],
      reviewComment: status === 'ACCEPTED' ? 'Проверено' : null,
      createdAt: now,
      updatedAt: now,
      regulation: null,
      template: {
        id: 'template-1',
        title: 'Дневной чек-лист',
        status: 'ACTIVE',
        version: 1,
      },
      store: {
        id: 'store-1',
        name: '1337-Холмогорова',
        city: 'Екатеринбург',
        address: null,
        timeZone: 'Asia/Yekaterinburg',
        isActive: true,
      },
      shift: null,
      createdByUser: {
        id: 'employee-1',
        email: 'employee@example.com',
        fullName: 'Руслан Завалин',
      },
      assignedToUser: {
        id: 'employee-1',
        email: 'employee@example.com',
        fullName: 'Руслан Завалин',
        staffMember: null,
      },
      reviewedByUser:
        status === 'ACCEPTED'
          ? {
              id: 'standards-manager-1',
              email: 'standards@example.com',
              fullName: 'Менеджер по стандартам',
            }
          : null,
    };
  }

  it('accepts a legacy checklist without rebinding or changing employee answers', async () => {
    const currentRun = run('ON_REVIEW');
    const acceptedRun = run('ACCEPTED');
    let capturedUpdate: unknown;
    const update = jest.fn((input: unknown) => {
      capturedUpdate = input;
      return Promise.resolve({ id: runId });
    });
    const transactionFindFirst = jest.fn().mockResolvedValue(acceptedRun);
    const transaction = {
      staffChecklistRun: {
        update,
        findFirst: transactionFindFirst,
      },
    };
    const prisma = {
      staffChecklistRun: {
        findFirst: jest.fn().mockResolvedValue(currentRun),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
        ),
    };
    const accessPolicy = {
      resolve: jest.fn().mockResolvedValue({
        tenantId,
        mode: 'NETWORK',
        allowedStoreIds: [],
        canManageStandards: true,
      }),
      readableRunWhere: jest.fn().mockReturnValue({}),
    };
    const bindings = {
      syncNativeResourceAttachments: jest.fn(),
    };
    const service = new StaffChecklistsService(
      prisma as never,
      accessPolicy as never,
      bindings as never,
    );

    const result = await service.updateChecklist(reviewer(), runId, {
      status: 'ACCEPTED',
      reviewComment: 'Проверено',
      answers: [
        {
          ...storedAnswers[0],
          note: 'Попытка изменить ответ вместе с решением',
        },
      ],
    });

    expect(result.status).toBe('ACCEPTED');
    expect(bindings.syncNativeResourceAttachments).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    const updateInput = capturedUpdate as {
      where: { id: string };
      data: {
        status: string;
        answers: Array<{
          itemId: string;
          note: string | null;
          evidenceUrl: string | null;
        }>;
      };
    };
    expect(updateInput.where).toEqual({ id: runId });
    expect(updateInput.data.status).toBe('ACCEPTED');
    expect(updateInput.data.answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'item-1',
          note: 'Ответ сотрудника',
          evidenceUrl: legacyUrl,
        }),
      ]),
    );
  });
});

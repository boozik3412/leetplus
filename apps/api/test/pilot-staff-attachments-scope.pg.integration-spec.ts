import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PrismaClient,
  StaffAttachmentResourceKind,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../src/auth/auth.types';
import { resolveUserCapabilities } from '../src/auth/capabilities';
import { PrismaService } from '../src/prisma/prisma.service';
import { StaffAttachmentBindingsService } from '../src/staff/staff-attachment-bindings.service';
import { StaffAttachmentsService } from '../src/staff/staff-attachments.service';
import { StaffChecklistsService } from '../src/staff/staff-checklists.service';
import { StaffKnowledgeBaseService } from '../src/staff/staff-knowledge-base.service';
import { StaffOnboardingPlansService } from '../src/staff/staff-onboarding-plans.service';
import { StaffShiftRegulationsService } from '../src/staff/staff-shift-regulations.service';
import type { StaffTasksService } from '../src/staff/staff-tasks.service';
import { StaffTeamChatService } from '../src/staff/staff-team-chat.service';
import { StaffTrainingCoursesService } from '../src/staff/staff-training-courses.service';
import { AccessScopeService } from '../src/tenancy/access-scope.service';
import { FreshStoreScopeService } from '../src/tenancy/fresh-store-scope.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const integrationConfirmation =
  'run-pilot-staff-attachments-scope-postgres-fixtures';
const integrationEnabled =
  process.env.PILOT_STAFF_ATTACHMENTS_SCOPE_PG_CONFIRM ===
  integrationConfirmation;
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
  userA2Id: string;
  userBNetworkId: string;
  channelA1Id: string;
  messageA1Id: string;
  checklistRunA1Id: string;
  knowledgeArticleA1Id: string;
  shiftRegulationA1Id: string;
  trainingCourseA1Id: string;
  onboardingPlanA1Id: string;
};

describePostgres('Gate 1MT staff attachment PostgreSQL scope matrix', () => {
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
    const [tenantResidue, userResidue, attachmentResidue] = await Promise.all([
      prisma.tenant.count({
        where: { slug: { startsWith: 'pilot-attachment-' } },
      }),
      prisma.user.count({
        where: { email: { endsWith: '@attachment.integration.invalid' } },
      }),
      prisma.staffAttachment.count({
        where: { fileName: { startsWith: 'PG attachment fixture ' } },
      }),
    ]);
    expect({ tenantResidue, userResidue, attachmentResidue }).toEqual({
      tenantResidue: 0,
      userResidue: 0,
      attachmentResidue: 0,
    });
    await prisma?.$disconnect();
  });

  it('keeps a pending upload private to its exact uploader and tenant', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const { attachments: service } = buildServices(prisma);
    const userA1 = buildUser(fixture, 'A1');
    const attachment = await service.createAttachment(userA1, {
      originalname: `PG attachment fixture pending ${randomUUID()}.png`,
      mimetype: 'image/png',
      buffer: Buffer.from('pending-a1'),
    });

    await expect(service.getAttachment(userA1, attachment.id)).resolves.toEqual(
      expect.objectContaining({
        contentType: 'image/png',
        buffer: Buffer.from('pending-a1'),
      }),
    );
    await expect(
      service.getAttachment(buildUser(fixture, 'A_NETWORK'), attachment.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getAttachment(buildUser(fixture, 'A2'), attachment.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getAttachment(buildUser(fixture, 'B_NETWORK'), attachment.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('authorizes a bound chat attachment through live tenant/store visibility', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const { attachments: service, bindings } = buildServices(prisma);
    const userA1 = buildUser(fixture, 'A1');
    const attachment = await service.createAttachment(userA1, {
      originalname: `PG attachment fixture bound ${randomUUID()}.txt`,
      mimetype: 'text/plain',
      buffer: Buffer.from('bound-a1'),
    });

    await prisma.$transaction((tx) =>
      bindings.bindPendingChatAttachments(tx, {
        tenantId: fixture.tenantAId,
        actorUserId: fixture.userA1Id,
        messageId: fixture.messageA1Id,
        attachmentIds: [attachment.id],
      }),
    );

    for (const user of [userA1, buildUser(fixture, 'A_NETWORK')]) {
      await expect(service.getAttachment(user, attachment.id)).resolves.toEqual(
        expect.objectContaining({ buffer: Buffer.from('bound-a1') }),
      );
    }
    await expect(
      service.getAttachment(buildUser(fixture, 'A2'), attachment.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getAttachment(buildUser(fixture, 'B_NETWORK'), attachment.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a stale store subject before returning bound bytes', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const { attachments: service, bindings } = buildServices(prisma);
    const staleUserA1 = buildUser(fixture, 'A1');
    const attachment = await service.createAttachment(staleUserA1, {
      originalname: `PG attachment fixture stale ${randomUUID()}.txt`,
      mimetype: 'text/plain',
      buffer: Buffer.from('stale-a1'),
    });

    await prisma.$transaction((tx) =>
      bindings.bindPendingChatAttachments(tx, {
        tenantId: fixture.tenantAId,
        actorUserId: fixture.userA1Id,
        messageId: fixture.messageA1Id,
        attachmentIds: [attachment.id],
      }),
    );
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
      service.getAttachment(staleUserA1, attachment.id),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('authorizes all remaining parent kinds only through fresh NETWORK visibility', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const { attachments: service, bindings } = buildServices(prisma);
    const networkUser = buildUser(fixture, 'A_NETWORK');
    const parents = [
      [StaffAttachmentResourceKind.CHECKLIST_RUN, fixture.checklistRunA1Id],
      [
        StaffAttachmentResourceKind.KNOWLEDGE_ARTICLE,
        fixture.knowledgeArticleA1Id,
      ],
      [
        StaffAttachmentResourceKind.SHIFT_REGULATION,
        fixture.shiftRegulationA1Id,
      ],
      [StaffAttachmentResourceKind.TRAINING_COURSE, fixture.trainingCourseA1Id],
      [StaffAttachmentResourceKind.ONBOARDING_PLAN, fixture.onboardingPlanA1Id],
    ] as const;

    for (const [resourceKind, resourceId] of parents) {
      const payload = Buffer.from(`network-parent-${resourceKind}`);
      const attachment = await service.createAttachment(networkUser, {
        originalname: `PG attachment fixture ${resourceKind} ${randomUUID()}.txt`,
        mimetype: 'text/plain',
        buffer: payload,
      });

      await prisma.$transaction((tx) =>
        bindings.bindPendingResourceAttachments(tx, {
          tenantId: fixture.tenantAId,
          actorUserId: fixture.userANetworkId,
          resourceKind,
          resourceId,
          attachmentIds: [attachment.id],
        }),
      );

      await expect(
        service.getAttachment(networkUser, attachment.id),
      ).resolves.toEqual(expect.objectContaining({ buffer: payload }));
      await expect(
        service.getAttachment(buildUser(fixture, 'A1'), attachment.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.getAttachment(buildUser(fixture, 'B_NETWORK'), attachment.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('atomically binds native writer references for all five staff parent kinds', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const services = buildServices(prisma);
    const user = buildUser(fixture, 'A_NETWORK');
    const parentRows: Array<{
      attachmentId: string;
      resourceId: string;
      resourceKind: StaffAttachmentResourceKind;
    }> = [];

    const upload = async (label: string) =>
      services.attachments.createAttachment(user, {
        originalname: `PG attachment fixture writer ${label} ${randomUUID()}.txt`,
        mimetype: 'text/plain',
        buffer: Buffer.from(`writer-${label}`),
      });

    const regulationAttachment = await upload('regulation');
    const regulation = await services.shiftRegulations.createRegulation(user, {
      title: `Writer regulation ${randomUUID()}`,
      attachments: [
        {
          title: 'Native regulation file',
          type: 'DOCUMENT',
          url: regulationAttachment.url,
        },
      ],
    });
    parentRows.push({
      attachmentId: regulationAttachment.id,
      resourceId: regulation.id,
      resourceKind: StaffAttachmentResourceKind.SHIFT_REGULATION,
    });

    const articleAttachment = await upload('article');
    const article = await services.knowledgeBase.createArticle(user, {
      title: `Writer article ${randomUUID()}`,
      content: `<p><a href="${articleAttachment.url}">Native file</a></p>`,
    });
    parentRows.push({
      attachmentId: articleAttachment.id,
      resourceId: article.id,
      resourceKind: StaffAttachmentResourceKind.KNOWLEDGE_ARTICLE,
    });

    const courseAttachment = await upload('course');
    const course = await services.trainingCourses.createCourse(user, {
      title: `Writer course ${randomUUID()}`,
      steps: [
        {
          title: 'Native course file',
          type: 'LINK',
          url: courseAttachment.url,
        },
      ],
    });
    parentRows.push({
      attachmentId: courseAttachment.id,
      resourceId: course.id,
      resourceKind: StaffAttachmentResourceKind.TRAINING_COURSE,
    });

    const planAttachment = await upload('onboarding');
    const plan = await services.onboardingPlans.createPlan(user, {
      title: `Writer onboarding ${randomUUID()}`,
      steps: [
        {
          title: 'Native onboarding file',
          type: 'LINK',
          url: planAttachment.url,
        },
      ],
    });
    parentRows.push({
      attachmentId: planAttachment.id,
      resourceId: plan.id,
      resourceKind: StaffAttachmentResourceKind.ONBOARDING_PLAN,
    });

    const checklistAttachment = await upload('checklist');
    await services.checklists.updateChecklist(user, fixture.checklistRunA1Id, {
      status: 'IN_PROGRESS',
      answers: [
        {
          sectionId: 'section-a',
          itemId: 'item-a',
          evidenceAttachments: [
            {
              id: checklistAttachment.id,
              fileName: checklistAttachment.fileName,
              contentType: checklistAttachment.contentType,
              byteSize: checklistAttachment.byteSize,
              url: checklistAttachment.url,
              createdAt: checklistAttachment.createdAt,
            },
          ],
        },
      ],
    });
    parentRows.push({
      attachmentId: checklistAttachment.id,
      resourceId: fixture.checklistRunA1Id,
      resourceKind: StaffAttachmentResourceKind.CHECKLIST_RUN,
    });

    for (const expected of parentRows) {
      await expect(
        prisma.staffAttachment.findUniqueOrThrow({
          where: { id: expected.attachmentId },
          select: { state: true, pendingExpiresAt: true },
        }),
      ).resolves.toEqual({ state: 'BOUND', pendingExpiresAt: null });
      await expect(
        prisma.staffAttachmentBinding.findMany({
          where: {
            tenantId: fixture.tenantAId,
            attachmentId: expected.attachmentId,
          },
          select: { resourceKind: true, resourceId: true, state: true },
        }),
      ).resolves.toEqual([
        {
          resourceKind: expected.resourceKind,
          resourceId: expected.resourceId,
          state: 'BOUND',
        },
      ]);
    }

    await services.trainingCourses.updateCourse(user, course.id, {
      steps: [
        {
          title: 'Native course file',
          type: 'LINK',
          url: courseAttachment.url,
        },
      ],
    });
    await expect(
      prisma.staffAttachmentBinding.count({
        where: {
          tenantId: fixture.tenantAId,
          attachmentId: courseAttachment.id,
          resourceKind: StaffAttachmentResourceKind.TRAINING_COURSE,
          resourceId: course.id,
          state: 'BOUND',
        },
      }),
    ).resolves.toBe(1);

    const foreignAttachment = await services.attachments.createAttachment(
      buildUser(fixture, 'B_NETWORK'),
      {
        originalname: `PG attachment fixture foreign ${randomUUID()}.txt`,
        mimetype: 'text/plain',
        buffer: Buffer.from('foreign-writer'),
      },
    );
    const rolledBackTitle = `Writer rollback ${randomUUID()}`;
    await expect(
      services.trainingCourses.createCourse(user, {
        title: rolledBackTitle,
        steps: [
          {
            title: 'Foreign native file',
            type: 'LINK',
            url: foreignAttachment.url,
          },
        ],
      }),
    ).rejects.toThrow('Attachment is not available');
    await expect(
      prisma.staffTrainingCourse.count({
        where: { tenantId: fixture.tenantAId, title: rolledBackTitle },
      }),
    ).resolves.toBe(0);
  });
});

function buildServices(prisma: PrismaService) {
  const freshStoreScopeService = new FreshStoreScopeService(
    prisma,
    new AccessScopeService(),
  );
  const bindings = new StaffAttachmentBindingsService();
  const teamChat = new StaffTeamChatService(
    prisma,
    freshStoreScopeService,
    bindings,
  );
  const staffTasks = {
    canReadAnyAttachmentTask: jest.fn().mockResolvedValue(false),
  } as unknown as StaffTasksService;
  const notificationChat = {
    createSystemNotification: jest.fn().mockResolvedValue(undefined),
  } as unknown as StaffTeamChatService;
  const tenantContext = new TenantContextService();

  return {
    attachments: new StaffAttachmentsService(
      prisma,
      new ConfigService({ STAFF_ATTACHMENT_ACL_MODE: 'ENFORCED' }),
      tenantContext,
      teamChat,
      staffTasks,
      freshStoreScopeService,
    ),
    bindings,
    shiftRegulations: new StaffShiftRegulationsService(
      prisma,
      tenantContext,
      notificationChat,
      bindings,
    ),
    knowledgeBase: new StaffKnowledgeBaseService(
      prisma,
      tenantContext,
      bindings,
    ),
    trainingCourses: new StaffTrainingCoursesService(
      prisma,
      tenantContext,
      notificationChat,
      bindings,
    ),
    onboardingPlans: new StaffOnboardingPlansService(
      prisma,
      tenantContext,
      bindings,
    ),
    checklists: new StaffChecklistsService(prisma, tenantContext, bindings),
  };
}

function buildUser(
  fixture: Fixture,
  kind: 'A_NETWORK' | 'A1' | 'A2' | 'B_NETWORK',
): AuthenticatedUser {
  if (kind === 'A1' || kind === 'A2') {
    const userId = kind === 'A1' ? fixture.userA1Id : fixture.userA2Id;
    const storeId = kind === 'A1' ? fixture.storeA1Id : fixture.storeA2Id;

    return {
      id: userId,
      email: `${kind.toLowerCase()}-${userId}@attachment.integration.invalid`,
      fullName: `${kind} manager`,
      role: UserRole.CLUB_MANAGER,
      permissions: resolveUserCapabilities({ role: UserRole.CLUB_MANAGER }),
      isPlatformAdmin: false,
      tenantId: fixture.tenantAId,
      tenantSlug: fixture.tenantASlug,
      accessScope: 'STORES',
      allowedStoreIds: [storeId],
    };
  }

  const isTenantB = kind === 'B_NETWORK';
  return {
    id: isTenantB ? fixture.userBNetworkId : fixture.userANetworkId,
    email: `${kind.toLowerCase()}-${
      isTenantB ? fixture.userBNetworkId : fixture.userANetworkId
    }@attachment.integration.invalid`,
    fullName: isTenantB ? 'Tenant B owner' : 'Tenant A owner',
    role: UserRole.OWNER,
    permissions: resolveUserCapabilities({ role: UserRole.OWNER }),
    isPlatformAdmin: false,
    tenantId: isTenantB ? fixture.tenantBId : fixture.tenantAId,
    tenantSlug: isTenantB ? fixture.tenantBSlug : fixture.tenantASlug,
    accessScope: 'NETWORK',
    allowedStoreIds: [],
  };
}

async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const suffix = randomUUID();
  const fixture: Fixture = {
    tenantAId: randomUUID(),
    tenantASlug: `pilot-attachment-a-${suffix}`,
    tenantBId: randomUUID(),
    tenantBSlug: `pilot-attachment-b-${suffix}`,
    storeA1Id: randomUUID(),
    storeA2Id: randomUUID(),
    storeB1Id: randomUUID(),
    userANetworkId: randomUUID(),
    userA1Id: randomUUID(),
    userA2Id: randomUUID(),
    userBNetworkId: randomUUID(),
    channelA1Id: randomUUID(),
    messageA1Id: randomUUID(),
    checklistRunA1Id: randomUUID(),
    knowledgeArticleA1Id: randomUUID(),
    shiftRegulationA1Id: randomUUID(),
    trainingCourseA1Id: randomUUID(),
    onboardingPlanA1Id: randomUUID(),
  };

  await prisma.$transaction(async (tx) => {
    await tx.tenant.createMany({
      data: [
        {
          id: fixture.tenantAId,
          name: `Pilot attachment A ${suffix}`,
          slug: fixture.tenantASlug,
        },
        {
          id: fixture.tenantBId,
          name: `Pilot attachment B ${suffix}`,
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
          email: `a-network-${suffix}@attachment.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Tenant A owner',
          role: UserRole.OWNER,
          accessScope: 'NETWORK',
        },
        {
          id: fixture.userA1Id,
          tenantId: fixture.tenantAId,
          email: `a1-${suffix}@attachment.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'A1 manager',
          role: UserRole.CLUB_MANAGER,
          accessScope: 'STORES',
        },
        {
          id: fixture.userA2Id,
          tenantId: fixture.tenantAId,
          email: `a2-${suffix}@attachment.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'A2 manager',
          role: UserRole.CLUB_MANAGER,
          accessScope: 'STORES',
        },
        {
          id: fixture.userBNetworkId,
          tenantId: fixture.tenantBId,
          email: `b-network-${suffix}@attachment.integration.invalid`,
          passwordHash: 'not-a-login-credential',
          fullName: 'Tenant B owner',
          role: UserRole.OWNER,
          accessScope: 'NETWORK',
        },
      ],
    });
    await tx.userStoreAccess.createMany({
      data: [
        { userId: fixture.userA1Id, storeId: fixture.storeA1Id },
        { userId: fixture.userA2Id, storeId: fixture.storeA2Id },
      ],
    });
    await tx.staffChatChannel.create({
      data: {
        id: fixture.channelA1Id,
        tenantId: fixture.tenantAId,
        createdByUserId: fixture.userANetworkId,
        storeId: fixture.storeA1Id,
        name: `A1 ${suffix}`,
        scope: 'STORE',
      },
    });
    await tx.staffChatMessage.create({
      data: {
        id: fixture.messageA1Id,
        tenantId: fixture.tenantAId,
        channelId: fixture.channelA1Id,
        authorUserId: fixture.userANetworkId,
        storeId: fixture.storeA1Id,
        body: `PG attachment fixture A1 ${suffix}`,
      },
    });
    await tx.staffChecklistRun.create({
      data: {
        id: fixture.checklistRunA1Id,
        tenantId: fixture.tenantAId,
        storeId: fixture.storeA1Id,
        createdByUserId: fixture.userANetworkId,
        assignedToUserId: fixture.userA1Id,
        title: `Attachment checklist ${suffix}`,
        sectionsSnapshot: [
          {
            id: 'section-a',
            title: 'Attachment section',
            description: null,
            items: [
              {
                id: 'item-a',
                title: 'Attachment item',
                instruction: null,
                valueType: 'FILE_LINK',
                required: false,
                evidenceRequired: false,
                score: 0,
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
        ],
        answers: [
          {
            sectionId: 'section-a',
            itemId: 'item-a',
            value: null,
            status: null,
            note: null,
            evidenceUrl: null,
            evidenceAttachments: [],
            reviewThreads: [],
            completedAt: null,
            timing: null,
          },
        ],
      },
    });
    await tx.staffKnowledgeArticle.create({
      data: {
        id: fixture.knowledgeArticleA1Id,
        tenantId: fixture.tenantAId,
        storeId: fixture.storeA1Id,
        createdByUserId: fixture.userANetworkId,
        title: `Attachment article ${suffix}`,
        content: 'Fixture article',
        status: 'PUBLISHED',
      },
    });
    await tx.staffShiftRegulation.create({
      data: {
        id: fixture.shiftRegulationA1Id,
        tenantId: fixture.tenantAId,
        storeId: fixture.storeA1Id,
        createdByUserId: fixture.userANetworkId,
        title: `Attachment regulation ${suffix}`,
        sections: [],
        status: 'PUBLISHED',
      },
    });
    await tx.staffTrainingCourse.create({
      data: {
        id: fixture.trainingCourseA1Id,
        tenantId: fixture.tenantAId,
        storeId: fixture.storeA1Id,
        createdByUserId: fixture.userANetworkId,
        title: `Attachment course ${suffix}`,
        steps: [],
        status: 'ACTIVE',
      },
    });
    await tx.staffOnboardingPlan.create({
      data: {
        id: fixture.onboardingPlanA1Id,
        tenantId: fixture.tenantAId,
        storeId: fixture.storeA1Id,
        createdByUserId: fixture.userANetworkId,
        title: `Attachment onboarding ${suffix}`,
        steps: [],
        status: 'ACTIVE',
      },
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
    prisma.staffAttachmentBinding.deleteMany({ where: { tenantId } }),
    prisma.staffChatMessageAttachment.deleteMany({ where: { tenantId } }),
    prisma.staffAttachment.deleteMany({ where: { tenantId } }),
    prisma.staffChatReadReceipt.deleteMany({ where: { tenantId } }),
    prisma.staffChatMention.deleteMany({ where: { tenantId } }),
    prisma.staffChatMessageEdit.deleteMany({ where: { tenantId } }),
    prisma.staffChatMessage.deleteMany({ where: { tenantId } }),
    prisma.staffChatChannelMember.deleteMany({ where: { tenantId } }),
    prisma.staffChatChannel.deleteMany({ where: { tenantId } }),
    prisma.staffChecklistRun.deleteMany({ where: { tenantId } }),
    prisma.staffKnowledgeArticle.deleteMany({ where: { tenantId } }),
    prisma.staffShiftRegulation.deleteMany({ where: { tenantId } }),
    prisma.staffTrainingCourse.deleteMany({ where: { tenantId } }),
    prisma.staffOnboardingPlan.deleteMany({ where: { tenantId } }),
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
      'DATABASE_URL is required for Gate 1MT attachment PostgreSQL fixtures',
    );
  }

  const parsed = new URL(databaseUrl);
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const databaseName = parsed.pathname.replace(/^\/+/, '').toLowerCase();
  const schemaName = parsed.searchParams.get('schema')?.toLowerCase() ?? '';
  const safeDatabaseName = /(?:^|[_-])(ci|test)(?:$|[_-])/.test(databaseName);
  const safeTemporarySchema = /^pilot_staff_attachment_test_[a-z0-9_]+$/.test(
    schemaName,
  );

  if (
    !localHosts.has(parsed.hostname) ||
    (!safeDatabaseName && !safeTemporarySchema)
  ) {
    throw new Error(
      'Refusing attachment fixtures outside a local CI/test database or isolated test schema',
    );
  }
}

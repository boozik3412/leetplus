import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
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
import { StaffChecklistAccessPolicyService } from '../src/staff/staff-checklist-access-policy.service';
import { StaffChecklistTemplatesService } from '../src/staff/staff-checklist-templates.service';
import { StaffChecklistsService } from '../src/staff/staff-checklists.service';
import { StaffKnowledgeBaseService } from '../src/staff/staff-knowledge-base.service';
import { StaffKnowledgeAccessPolicyService } from '../src/staff/staff-knowledge-access-policy.service';
import { StaffShiftRegulationAccessPolicyService } from '../src/staff/staff-shift-regulation-access-policy.service';
import { StaffOnboardingPlansService } from '../src/staff/staff-onboarding-plans.service';
import { StaffShiftRegulationsService } from '../src/staff/staff-shift-regulations.service';
import type { StaffTasksService } from '../src/staff/staff-tasks.service';
import { StaffTeamChatService } from '../src/staff/staff-team-chat.service';
import { StaffTrainingAccessPolicyService } from '../src/staff/staff-training-access-policy.service';
import { StaffTrainingCoursesService } from '../src/staff/staff-training-courses.service';
import { StaffTrainingProfilesService } from '../src/staff/staff-training-profiles.service';
import { AccessScopeService } from '../src/tenancy/access-scope.service';
import { FreshStoreScopeService } from '../src/tenancy/fresh-store-scope.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { lockUserRoleAuthority } from '../src/users/user-role-authority-lock';

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

type HeldDatabaseLock = {
  blockerPid: number;
  release: () => void;
  finished: Promise<void>;
};

type OperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

function validRegulationSections(label: string) {
  return [
    {
      id: `section-${label}`,
      title: `Section ${label}`,
      description: null,
      items: [
        {
          id: `item-${label}`,
          title: `Item ${label}`,
          instruction: null,
          valueType: 'CHECKBOX',
          required: true,
          evidenceRequired: false,
          score: 1,
        },
      ],
    },
  ];
}

describePostgres('Gate 1MT staff attachment PostgreSQL scope matrix', () => {
  let prisma: PrismaService;
  let concurrentPrisma: PrismaClient;
  const fixtureTenantIds = new Set<string>();

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    prisma = new PrismaService();
    concurrentPrisma = new PrismaClient();
    await Promise.all([prisma.$connect(), concurrentPrisma.$connect()]);
  });

  afterEach(async () => {
    for (const tenantId of fixtureTenantIds) {
      await cleanupFixture(prisma, tenantId);
    }
    fixtureTenantIds.clear();
  });

  afterAll(async () => {
    if (prisma === undefined) {
      return;
    }

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
    await Promise.allSettled([
      prisma?.$disconnect(),
      concurrentPrisma?.$disconnect(),
    ]);
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

  it('adopts all five staff attachment parents into the same store-aware boundary', async () => {
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
      ).resolves.toEqual(expect.objectContaining({ buffer: payload }));
      await expect(
        service.getAttachment(buildUser(fixture, 'A2'), attachment.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.getAttachment(buildUser(fixture, 'B_NETWORK'), attachment.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('enforces checklist template, run, report and mutation boundaries for STORES', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const services = buildServices(prisma);
    const userA1 = buildUser(fixture, 'A1');
    const userA2 = buildUser(fixture, 'A2');
    const networkTemplateId = randomUUID();
    const storeA1TemplateId = randomUUID();
    const storeA2TemplateId = randomUUID();
    const sections = validRegulationSections(`checklist-scope-${randomUUID()}`);

    await prisma.staffChecklistTemplate.createMany({
      data: [
        {
          id: networkTemplateId,
          tenantId: fixture.tenantAId,
          createdByUserId: fixture.userANetworkId,
          title: `Network active checklist ${randomUUID()}`,
          status: 'ACTIVE',
          roleScope: 'ALL_STAFF',
          sections,
        },
        {
          id: storeA1TemplateId,
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA1Id,
          createdByUserId: fixture.userA1Id,
          title: `A1 draft checklist ${randomUUID()}`,
          status: 'DRAFT',
          roleScope: 'ALL_STAFF',
          sections,
        },
        {
          id: storeA2TemplateId,
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA2Id,
          createdByUserId: fixture.userA2Id,
          title: `A2 draft checklist ${randomUUID()}`,
          status: 'DRAFT',
          roleScope: 'ALL_STAFF',
          sections,
        },
      ],
    });

    const [a1Catalog, a2Catalog] = await Promise.all([
      services.checklistTemplates.getTemplates(userA1, { status: 'all' }),
      services.checklistTemplates.getTemplates(userA2, { status: 'all' }),
    ]);
    expect(a1Catalog.accessScope).toBe('STORES');
    expect(a1Catalog.stores.map(({ id }) => id)).toEqual([fixture.storeA1Id]);
    expect(a1Catalog.rows.map(({ id }) => id)).toEqual(
      expect.arrayContaining([networkTemplateId, storeA1TemplateId]),
    );
    expect(a1Catalog.rows.map(({ id }) => id)).not.toContain(storeA2TemplateId);
    expect(
      a1Catalog.rows.find(({ id }) => id === networkTemplateId)?.canManage,
    ).toBe(false);
    expect(
      a1Catalog.rows.find(({ id }) => id === storeA1TemplateId)?.canManage,
    ).toBe(true);
    expect(a2Catalog.rows.map(({ id }) => id)).toEqual(
      expect.arrayContaining([networkTemplateId, storeA2TemplateId]),
    );
    expect(a2Catalog.rows.map(({ id }) => id)).not.toContain(storeA1TemplateId);

    await expect(
      services.checklistTemplates.getTemplates(userA1, {
        storeId: fixture.storeA2Id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.checklistTemplates.updateTemplate(userA1, networkTemplateId, {
        title: 'Forbidden network rewrite',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      services.checklistTemplates.updateTemplate(userA1, storeA2TemplateId, {
        title: 'Forbidden A2 rewrite',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      services.checklistTemplates.createTemplate(userA1, {
        title: 'Forbidden network template',
        storeId: null,
        sections,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.checklistTemplates.createTemplate(userA1, {
        title: 'Forbidden A2 template',
        storeId: fixture.storeA2Id,
        sections,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const createdTemplate = await services.checklistTemplates.createTemplate(
      userA1,
      {
        title: `A1 created checklist ${randomUUID()}`,
        storeId: fixture.storeA1Id,
        status: 'ACTIVE',
        roleScope: 'ALL_STAFF',
        sections,
      },
    );
    expect(createdTemplate.canManage).toBe(true);
    expect(createdTemplate.store?.id).toBe(fixture.storeA1Id);

    const [runA1, runA2] = await Promise.all([
      services.checklists.createChecklist(userA1, {
        templateId: networkTemplateId,
        storeId: fixture.storeA1Id,
      }),
      services.checklists.createChecklist(userA2, {
        templateId: networkTemplateId,
        storeId: fixture.storeA2Id,
      }),
    ]);
    const [a1Runs, a2Runs, a1Execution] = await Promise.all([
      services.checklists.getChecklists(userA1),
      services.checklists.getChecklists(userA2),
      services.checklists.getExecutionReport(userA1),
    ]);
    expect(a1Runs.accessScope).toBe('STORES');
    expect(a1Runs.rows.map(({ id }) => id)).toContain(runA1.id);
    expect(a1Runs.rows.map(({ id }) => id)).not.toContain(runA2.id);
    expect(a2Runs.rows.map(({ id }) => id)).toContain(runA2.id);
    expect(a2Runs.rows.map(({ id }) => id)).not.toContain(runA1.id);
    expect(a1Execution.accessScope).toBe('STORES');
    expect(a1Execution.runs.map(({ id }) => id)).toContain(runA1.id);
    expect(a1Execution.runs.map(({ id }) => id)).not.toContain(runA2.id);
    await expect(
      services.checklists.getExecutionReport(userA1, {
        storeId: fixture.storeA2Id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.checklists.updateChecklist(userA1, runA2.id, {
        status: 'CANCELED',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces the knowledge catalog, writer and settings boundary for STORES', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const services = buildServices(prisma);
    const networkUser = buildUser(fixture, 'A_NETWORK');
    const storeA1User = buildUser(fixture, 'A1');
    const networkArticleId = randomUUID();
    const storeA2ArticleId = randomUUID();

    await prisma.staffKnowledgeArticle.createMany({
      data: [
        {
          id: networkArticleId,
          tenantId: fixture.tenantAId,
          createdByUserId: fixture.userANetworkId,
          title: `Network published article ${randomUUID()}`,
          status: 'PUBLISHED',
          version: 1,
          roleScope: 'ALL_STAFF',
          publishedAt: new Date(),
        },
        {
          id: storeA2ArticleId,
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA2Id,
          createdByUserId: fixture.userANetworkId,
          title: `A2 private draft ${randomUUID()}`,
          status: 'DRAFT',
        },
      ],
    });
    const settings = await prisma.staffKnowledgeSettings.create({
      data: {
        tenantId: fixture.tenantAId,
        updatedByUserId: fixture.userANetworkId,
      },
      select: { id: true },
    });
    await prisma.staffKnowledgeSettingsEvent.create({
      data: {
        tenantId: fixture.tenantAId,
        settingsId: settings.id,
        actorUserId: fixture.userANetworkId,
        nextRevisionSlaPolicy: { defaultDays: 2 },
      },
    });

    const ownDraft = await services.knowledgeBase.createArticle(storeA1User, {
      title: `A1 draft ${randomUUID()}`,
      storeId: fixture.storeA1Id,
      status: 'DRAFT',
    });
    await prisma.staffKnowledgeArticleReadReceipt.create({
      data: {
        tenantId: fixture.tenantAId,
        articleId: ownDraft.id,
        userId: fixture.userA2Id,
        version: ownDraft.version,
        note: 'Adversarial out-of-scope historical receipt',
      },
    });
    const report = await services.knowledgeBase.getArticles(storeA1User);
    const visibleIds = report.rows.map((row) => row.id);

    expect(report.accessScope).toBe('STORES');
    expect(report.stores.map((store) => store.id)).toEqual([fixture.storeA1Id]);
    expect(visibleIds).toEqual(
      expect.arrayContaining([
        fixture.knowledgeArticleA1Id,
        networkArticleId,
        ownDraft.id,
      ]),
    );
    expect(visibleIds).not.toContain(storeA2ArticleId);
    expect(
      report.rows.find((row) => row.id === networkArticleId)?.canManage,
    ).toBe(false);
    expect(report.rows.find((row) => row.id === ownDraft.id)?.canManage).toBe(
      true,
    );
    expect(
      report.rows
        .find((row) => row.id === ownDraft.id)
        ?.readReceipts.map((receipt) => receipt.user.id),
    ).not.toContain(fixture.userA2Id);
    expect(report.settings.updatedByUser).toBeNull();
    expect(report.settings.history).toEqual([]);

    await expect(
      services.knowledgeBase.createArticle(storeA1User, {
        title: `Network escape ${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.knowledgeBase.createArticle(storeA1User, {
        title: `A2 escape ${randomUUID()}`,
        storeId: fixture.storeA2Id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.knowledgeBase.updateArticle(storeA1User, networkArticleId, {
        title: 'Forbidden network edit',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      services.knowledgeBase.updateArticle(storeA1User, storeA2ArticleId, {
        title: 'Forbidden A2 edit',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      services.knowledgeBase.updateArticle(storeA1User, ownDraft.id, {
        title: 'Allowed A1 edit',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ title: 'Allowed A1 edit', canManage: true }),
    );
    await expect(
      services.knowledgeBase.updateSettings(storeA1User, {
        revisionSlaPolicy: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const networkReport = await services.knowledgeBase.getArticles(networkUser);
    expect(networkReport.accessScope).toBe('NETWORK');
    expect(networkReport.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: storeA2ArticleId, canManage: true }),
      ]),
    );
    expect(
      networkReport.rows
        .find((row) => row.id === ownDraft.id)
        ?.readReceipts.map((receipt) => receipt.user.id),
    ).toContain(fixture.userA2Id);
    expect(networkReport.settings.updatedByUser?.id).toBe(
      fixture.userANetworkId,
    );
    expect(networkReport.settings.history).toHaveLength(1);
  });

  it('enforces shift-regulation catalog, writer, acknowledgement and store boundaries', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const services = buildServices(prisma);
    const networkUser = buildUser(fixture, 'A_NETWORK');
    const storeA1User = buildUser(fixture, 'A1');
    const networkRegulationId = randomUUID();
    const storeA2RegulationId = randomUUID();
    const storeA1AssessmentId = randomUUID();
    const storeA2AssessmentId = randomUUID();

    await prisma.staffAssessment.createMany({
      data: [
        {
          id: storeA1AssessmentId,
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA1Id,
          createdByUserId: fixture.userANetworkId,
          title: `A1 active assessment ${randomUUID()}`,
          status: 'ACTIVE',
          questions: [],
        },
        {
          id: storeA2AssessmentId,
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA2Id,
          createdByUserId: fixture.userANetworkId,
          title: `A2 active assessment ${randomUUID()}`,
          status: 'ACTIVE',
          questions: [],
        },
      ],
    });

    await prisma.staffShiftRegulation.createMany({
      data: [
        {
          id: networkRegulationId,
          tenantId: fixture.tenantAId,
          createdByUserId: fixture.userANetworkId,
          title: `Network published regulation ${randomUUID()}`,
          status: 'PUBLISHED',
          version: 1,
          roleScope: 'ALL_STAFF',
          sections: validRegulationSections('network'),
          publishedAt: new Date(),
        },
        {
          id: storeA2RegulationId,
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA2Id,
          createdByUserId: fixture.userANetworkId,
          title: `A2 private regulation ${randomUUID()}`,
          status: 'DRAFT',
          sections: validRegulationSections('a2'),
        },
      ],
    });

    const ownDraft = await services.shiftRegulations.createRegulation(
      storeA1User,
      {
        title: `A1 regulation ${randomUUID()}`,
        storeId: fixture.storeA1Id,
        status: 'DRAFT',
      },
    );
    const report = await services.shiftRegulations.getRegulations(storeA1User);
    const visibleIds = report.rows.map((row) => row.id);

    expect(report.accessScope).toBe('STORES');
    expect(report.canManageStandards).toBe(true);
    expect(report.stores.map((store) => store.id)).toEqual([fixture.storeA1Id]);
    expect(report.assessments.map((assessment) => assessment.id)).toEqual([
      storeA1AssessmentId,
    ]);
    expect(visibleIds).toEqual(
      expect.arrayContaining([
        fixture.shiftRegulationA1Id,
        networkRegulationId,
        ownDraft.id,
      ]),
    );
    expect(visibleIds).not.toContain(storeA2RegulationId);
    expect(
      report.rows.find((row) => row.id === networkRegulationId)?.canManage,
    ).toBe(false);
    expect(report.rows.find((row) => row.id === ownDraft.id)?.canManage).toBe(
      true,
    );

    await expect(
      services.shiftRegulations.createRegulation(storeA1User, {
        title: `Network escape ${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.shiftRegulations.createRegulation(storeA1User, {
        title: `A2 escape ${randomUUID()}`,
        storeId: fixture.storeA2Id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.shiftRegulations.createRegulation(storeA1User, {
        title: `A2 assessment escape ${randomUUID()}`,
        storeId: fixture.storeA1Id,
        requiresAssessmentRetake: true,
        assessmentId: storeA2AssessmentId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      services.shiftRegulations.getRegulations(storeA1User, {
        storeId: fixture.storeA2Id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.shiftRegulations.updateRegulation(
        storeA1User,
        networkRegulationId,
        { title: 'Forbidden network edit' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      services.shiftRegulations.updateRegulation(
        storeA1User,
        storeA2RegulationId,
        { title: 'Forbidden A2 edit' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    const updatedOwnDraft = await services.shiftRegulations.updateRegulation(
      storeA1User,
      ownDraft.id,
      { title: 'Allowed A1 regulation edit' },
    );
    expect(updatedOwnDraft).toEqual(
      expect.objectContaining({
        title: 'Allowed A1 regulation edit',
        canManage: true,
      }),
    );
    expect(updatedOwnDraft.store?.id).toBe(fixture.storeA1Id);

    await expect(
      services.shiftRegulations.acknowledgeRegulation(
        storeA1User,
        networkRegulationId,
      ),
    ).resolves.toEqual(expect.objectContaining({ userId: fixture.userA1Id }));

    const acknowledged =
      await services.shiftRegulations.getRegulations(storeA1User);
    expect(
      acknowledged.rows.find((row) => row.id === networkRegulationId)
        ?.acknowledgementSummary.acknowledgedByMe,
    ).toBe(true);

    const networkReport =
      await services.shiftRegulations.getRegulations(networkUser);
    expect(networkReport.accessScope).toBe('NETWORK');
    expect(networkReport.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: storeA2RegulationId, canManage: true }),
      ]),
    );
  });

  it('enforces training course, profile, progress and attachment boundaries for STORES', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const services = buildServices(prisma);
    const networkUser = buildUser(fixture, 'A_NETWORK');
    const storeA1User = buildUser(fixture, 'A1');
    const networkCourseId = randomUUID();
    const storeA2CourseId = randomUUID();

    await prisma.staffTrainingCourse.createMany({
      data: [
        {
          id: networkCourseId,
          tenantId: fixture.tenantAId,
          createdByUserId: fixture.userANetworkId,
          title: `Network active course ${randomUUID()}`,
          status: 'ACTIVE',
          roleScope: 'ALL_STAFF',
          steps: [],
        },
        {
          id: storeA2CourseId,
          tenantId: fixture.tenantAId,
          storeId: fixture.storeA2Id,
          createdByUserId: fixture.userANetworkId,
          title: `A2 active course ${randomUUID()}`,
          status: 'ACTIVE',
          roleScope: 'ALL_STAFF',
          steps: [],
        },
      ],
    });

    const ownCourse = await services.trainingCourses.createCourse(storeA1User, {
      title: `A1 draft course ${randomUUID()}`,
      storeId: fixture.storeA1Id,
      status: 'DRAFT',
    });
    const report = await services.trainingCourses.getCourses(storeA1User);
    const visibleIds = report.rows.map((row) => row.id);

    expect(report.accessScope).toBe('STORES');
    expect(report.canManageTraining).toBe(true);
    expect(report.stores.map((store) => store.id)).toEqual([fixture.storeA1Id]);
    expect(visibleIds).toEqual(
      expect.arrayContaining([
        fixture.trainingCourseA1Id,
        networkCourseId,
        ownCourse.id,
      ]),
    );
    expect(visibleIds).not.toContain(storeA2CourseId);
    expect(
      report.rows.find((row) => row.id === networkCourseId)?.canManage,
    ).toBe(false);
    expect(report.rows.find((row) => row.id === ownCourse.id)?.canManage).toBe(
      true,
    );

    await expect(
      services.trainingCourses.createCourse(storeA1User, {
        title: `Network training escape ${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.trainingCourses.createCourse(storeA1User, {
        title: `A2 training escape ${randomUUID()}`,
        storeId: fixture.storeA2Id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.trainingCourses.getCourses(storeA1User, {
        storeId: fixture.storeA2Id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.trainingCourses.updateCourse(storeA1User, networkCourseId, {
        title: 'Forbidden network training edit',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      services.trainingCourses.updateCourse(storeA1User, storeA2CourseId, {
        title: 'Forbidden A2 training edit',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const updatedOwnCourse = await services.trainingCourses.updateCourse(
      storeA1User,
      ownCourse.id,
      { title: 'Allowed A1 training edit' },
    );
    expect(updatedOwnCourse).toEqual(
      expect.objectContaining({
        title: 'Allowed A1 training edit',
        canManage: true,
      }),
    );
    expect(updatedOwnCourse.store?.id).toBe(fixture.storeA1Id);

    const attachment = await services.attachments.createAttachment(
      storeA1User,
      {
        originalname: `A1 training ${randomUUID()}.txt`,
        mimetype: 'text/plain',
        buffer: Buffer.from('training-a1'),
      },
    );
    const attachedCourse = await services.trainingCourses.createCourse(
      storeA1User,
      {
        title: `A1 attached course ${randomUUID()}`,
        storeId: fixture.storeA1Id,
        status: 'ACTIVE',
        steps: [
          {
            title: 'A1 native attachment',
            type: 'LINK',
            url: attachment.url,
          },
        ],
      },
    );
    await expect(
      services.attachments.getAttachment(storeA1User, attachment.id),
    ).resolves.toEqual(
      expect.objectContaining({ buffer: Buffer.from('training-a1') }),
    );
    await expect(
      services.attachments.getAttachment(
        buildUser(fixture, 'A2'),
        attachment.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const profiles = await services.trainingProfiles.getProfiles(storeA1User);
    expect(profiles.accessScope).toBe('STORES');
    expect(profiles.stores.map((store) => store.id)).toEqual([
      fixture.storeA1Id,
    ]);
    expect(profiles.rows.map((row) => row.user.id)).toEqual([fixture.userA1Id]);
    expect(profiles.rows[0]?.courses.map((course) => course.id)).toEqual(
      expect.arrayContaining([
        fixture.trainingCourseA1Id,
        networkCourseId,
        attachedCourse.id,
      ]),
    );
    expect(profiles.rows[0]?.courses.map((course) => course.id)).not.toContain(
      storeA2CourseId,
    );

    const savedProgress = await services.trainingProfiles.updateProgress(
      storeA1User,
      {
        userId: fixture.userA1Id,
        courseId: networkCourseId,
        status: 'IN_PROGRESS',
        progressPercent: 25,
      },
    );
    expect(savedProgress.id).toBe(networkCourseId);
    expect(savedProgress.progress.progressPercent).toBe(25);
    await expect(
      services.trainingProfiles.updateProgress(storeA1User, {
        userId: fixture.userA2Id,
        courseId: networkCourseId,
        status: 'COMPLETED',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      services.trainingProfiles.updateProgress(storeA1User, {
        userId: fixture.userA1Id,
        courseId: storeA2CourseId,
        status: 'COMPLETED',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const networkReport =
      await services.trainingCourses.getCourses(networkUser);
    expect(networkReport.accessScope).toBe('NETWORK');
    expect(networkReport.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: storeA2CourseId, canManage: true }),
      ]),
    );
  });

  it('enforces onboarding catalog, references, writer and attachment boundaries for STORES', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const services = buildServices(prisma);
    const networkUser = buildUser(fixture, 'A_NETWORK');
    const storeA1User = buildUser(fixture, 'A1');
    const storeA2User = buildUser(fixture, 'A2');
    const networkPlanId = randomUUID();
    const storeA2PlanId = randomUUID();
    const networkCourseId = randomUUID();
    const storeA2CourseId = randomUUID();
    const networkTaskId = randomUUID();
    const storeA1TaskId = randomUUID();
    const storeA2TaskId = randomUUID();
    const networkChecklistId = randomUUID();
    const storeA1ChecklistId = randomUUID();
    const storeA2ChecklistId = randomUUID();
    const networkRegulationId = randomUUID();
    const storeA1RegulationId = randomUUID();
    const storeA2RegulationId = randomUUID();

    await prisma.$transaction([
      prisma.staffOnboardingPlan.createMany({
        data: [
          {
            id: networkPlanId,
            tenantId: fixture.tenantAId,
            createdByUserId: fixture.userANetworkId,
            title: `Network active onboarding ${randomUUID()}`,
            status: 'ACTIVE',
            roleScope: 'ALL_STAFF',
            steps: [],
          },
          {
            id: storeA2PlanId,
            tenantId: fixture.tenantAId,
            storeId: fixture.storeA2Id,
            createdByUserId: fixture.userA2Id,
            title: `A2 private onboarding ${randomUUID()}`,
            status: 'ACTIVE',
            roleScope: 'ALL_STAFF',
            steps: [],
          },
        ],
      }),
      prisma.staffTrainingCourse.createMany({
        data: [
          {
            id: networkCourseId,
            tenantId: fixture.tenantAId,
            title: `Network onboarding course ${randomUUID()}`,
            status: 'ACTIVE',
            roleScope: 'ALL_STAFF',
            steps: [],
          },
          {
            id: storeA2CourseId,
            tenantId: fixture.tenantAId,
            storeId: fixture.storeA2Id,
            title: `A2 onboarding course ${randomUUID()}`,
            status: 'ACTIVE',
            roleScope: 'ALL_STAFF',
            steps: [],
          },
        ],
      }),
      prisma.staffTaskTemplate.createMany({
        data: [
          {
            id: networkTaskId,
            tenantId: fixture.tenantAId,
            title: `Network onboarding task ${randomUUID()}`,
            status: 'ACTIVE',
          },
          {
            id: storeA1TaskId,
            tenantId: fixture.tenantAId,
            storeId: fixture.storeA1Id,
            title: `A1 onboarding task ${randomUUID()}`,
            status: 'ACTIVE',
          },
          {
            id: storeA2TaskId,
            tenantId: fixture.tenantAId,
            storeId: fixture.storeA2Id,
            title: `A2 onboarding task ${randomUUID()}`,
            status: 'ACTIVE',
          },
        ],
      }),
      prisma.staffChecklistTemplate.createMany({
        data: [
          {
            id: networkChecklistId,
            tenantId: fixture.tenantAId,
            title: `Network onboarding checklist ${randomUUID()}`,
            status: 'ACTIVE',
            roleScope: 'ALL_STAFF',
            sections: [],
          },
          {
            id: storeA1ChecklistId,
            tenantId: fixture.tenantAId,
            storeId: fixture.storeA1Id,
            title: `A1 onboarding checklist ${randomUUID()}`,
            status: 'ACTIVE',
            roleScope: 'ALL_STAFF',
            sections: [],
          },
          {
            id: storeA2ChecklistId,
            tenantId: fixture.tenantAId,
            storeId: fixture.storeA2Id,
            title: `A2 onboarding checklist ${randomUUID()}`,
            status: 'ACTIVE',
            roleScope: 'ALL_STAFF',
            sections: [],
          },
        ],
      }),
      prisma.staffShiftRegulation.createMany({
        data: [
          {
            id: networkRegulationId,
            tenantId: fixture.tenantAId,
            title: `Network onboarding regulation ${randomUUID()}`,
            status: 'PUBLISHED',
            roleScope: 'ALL_STAFF',
            sections: [],
          },
          {
            id: storeA1RegulationId,
            tenantId: fixture.tenantAId,
            storeId: fixture.storeA1Id,
            title: `A1 onboarding regulation ${randomUUID()}`,
            status: 'PUBLISHED',
            roleScope: 'ALL_STAFF',
            sections: [],
          },
          {
            id: storeA2RegulationId,
            tenantId: fixture.tenantAId,
            storeId: fixture.storeA2Id,
            title: `A2 onboarding regulation ${randomUUID()}`,
            status: 'PUBLISHED',
            roleScope: 'ALL_STAFF',
            sections: [],
          },
        ],
      }),
    ]);

    const ownPlan = await services.onboardingPlans.createPlan(storeA1User, {
      title: `A1 draft onboarding ${randomUUID()}`,
      storeId: fixture.storeA1Id,
      status: 'DRAFT',
      steps: [
        {
          title: 'A1 task',
          type: 'TASK_TEMPLATE',
          taskTemplateId: storeA1TaskId,
        },
        {
          title: 'Network checklist',
          type: 'CHECKLIST_TEMPLATE',
          checklistTemplateId: networkChecklistId,
        },
        {
          title: 'A1 regulation',
          type: 'REGULATION',
          regulationId: storeA1RegulationId,
        },
      ],
    });
    const report = await services.onboardingPlans.getPlans(storeA1User);
    const visibleIds = report.rows.map((row) => row.id);

    expect(report.accessScope).toBe('STORES');
    expect(report.stores.map((store) => store.id)).toEqual([fixture.storeA1Id]);
    expect(visibleIds).toEqual(
      expect.arrayContaining([
        fixture.onboardingPlanA1Id,
        networkPlanId,
        ownPlan.id,
      ]),
    );
    expect(visibleIds).not.toContain(storeA2PlanId);
    expect(report.rows.find((row) => row.id === networkPlanId)?.canManage).toBe(
      false,
    );
    expect(report.rows.find((row) => row.id === ownPlan.id)?.canManage).toBe(
      true,
    );
    expect(report.courses.map((row) => row.id)).toEqual(
      expect.arrayContaining([fixture.trainingCourseA1Id, networkCourseId]),
    );
    expect(report.courses.map((row) => row.id)).not.toContain(storeA2CourseId);
    expect(report.taskTemplates.map((row) => row.id)).toEqual(
      expect.arrayContaining([networkTaskId, storeA1TaskId]),
    );
    expect(report.taskTemplates.map((row) => row.id)).not.toContain(
      storeA2TaskId,
    );
    expect(report.checklistTemplates.map((row) => row.id)).toEqual(
      expect.arrayContaining([networkChecklistId, storeA1ChecklistId]),
    );
    expect(report.checklistTemplates.map((row) => row.id)).not.toContain(
      storeA2ChecklistId,
    );
    expect(report.regulations.map((row) => row.id)).toEqual(
      expect.arrayContaining([networkRegulationId, storeA1RegulationId]),
    );
    expect(report.regulations.map((row) => row.id)).not.toContain(
      storeA2RegulationId,
    );

    await expect(
      services.onboardingPlans.createPlan(storeA1User, {
        title: `Network onboarding escape ${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.onboardingPlans.createPlan(storeA1User, {
        title: `A2 onboarding escape ${randomUUID()}`,
        storeId: fixture.storeA2Id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      services.onboardingPlans.createPlan(storeA1User, {
        title: `A2 course reference escape ${randomUUID()}`,
        storeId: fixture.storeA1Id,
        steps: [
          {
            title: 'Foreign course',
            type: 'COURSE',
            courseId: storeA2CourseId,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      services.onboardingPlans.getPlans(storeA1User, {
        storeId: fixture.storeA2Id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      services.onboardingPlans.updatePlan(storeA1User, networkPlanId, {
        title: 'Forbidden network onboarding edit',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      services.onboardingPlans.updatePlan(storeA1User, storeA2PlanId, {
        title: 'Forbidden A2 onboarding edit',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      services.onboardingPlans.updatePlan(storeA1User, ownPlan.id, {
        title: 'Allowed A1 onboarding edit',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        title: 'Allowed A1 onboarding edit',
        canManage: true,
      }),
    );

    const attachment = await services.attachments.createAttachment(
      storeA1User,
      {
        originalname: `A1 onboarding ${randomUUID()}.txt`,
        mimetype: 'text/plain',
        buffer: Buffer.from('onboarding-a1'),
      },
    );
    await services.onboardingPlans.createPlan(storeA1User, {
      title: `A1 attached onboarding ${randomUUID()}`,
      storeId: fixture.storeA1Id,
      status: 'ACTIVE',
      steps: [
        {
          title: 'A1 native attachment',
          type: 'LINK',
          url: attachment.url,
        },
      ],
    });
    await expect(
      services.attachments.getAttachment(storeA1User, attachment.id),
    ).resolves.toEqual(
      expect.objectContaining({ buffer: Buffer.from('onboarding-a1') }),
    );
    await expect(
      services.attachments.getAttachment(storeA2User, attachment.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const storeA2Report = await services.onboardingPlans.getPlans(storeA2User);
    expect(storeA2Report.rows.map((row) => row.id)).toContain(storeA2PlanId);
    expect(storeA2Report.rows.map((row) => row.id)).not.toContain(ownPlan.id);
    const networkReport = await services.onboardingPlans.getPlans(networkUser);
    expect(networkReport.accessScope).toBe('NETWORK');
    expect(networkReport.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: storeA2PlanId, canManage: true }),
      ]),
    );
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

    await services.shiftRegulations.updateRegulation(user, regulation.id, {
      status: 'ARCHIVED',
    });
    await services.knowledgeBase.updateArticle(user, article.id, {
      status: 'ARCHIVED',
    });
    await services.trainingCourses.updateCourse(user, course.id, {
      status: 'ARCHIVED',
    });
    await services.onboardingPlans.updatePlan(user, plan.id, {
      status: 'ARCHIVED',
    });
    await services.checklists.updateChecklist(user, fixture.checklistRunA1Id, {
      status: 'ACCEPTED',
    });

    for (const expected of parentRows) {
      await expect(
        prisma.staffAttachment.findUniqueOrThrow({
          where: { id: expected.attachmentId },
          select: { state: true, stateReasonCode: true },
        }),
      ).resolves.toEqual({ state: 'BOUND', stateReasonCode: null });
      const downloaded = await services.attachments.getAttachment(
        user,
        expected.attachmentId,
      );
      expect(downloaded.contentType).toBe('text/plain');
      expect(Buffer.isBuffer(downloaded.buffer)).toBe(true);
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

    await services.knowledgeBase.updateArticle(user, article.id, {
      summary: 'Status-only native binding retention check',
    });
    await expect(
      prisma.staffAttachmentBinding.count({
        where: {
          tenantId: fixture.tenantAId,
          attachmentId: articleAttachment.id,
          resourceKind: StaffAttachmentResourceKind.KNOWLEDGE_ARTICLE,
          resourceId: article.id,
          state: 'BOUND',
        },
      }),
    ).resolves.toBe(1);

    await services.trainingCourses.updateCourse(user, course.id, { steps: [] });
    await expect(
      prisma.staffAttachment.findUniqueOrThrow({
        where: { id: courseAttachment.id },
        select: { state: true, stateReasonCode: true },
      }),
    ).resolves.toEqual({
      state: 'QUARANTINED',
      stateReasonCode: 'NATIVE_REFERENCE_REMOVED',
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
    ).resolves.toBe(0);
    await expect(
      services.attachments.getAttachment(user, courseAttachment.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    await services.shiftRegulations.deleteRegulation(user, regulation.id);
    await expect(
      prisma.staffShiftRegulation.count({ where: { id: regulation.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.staffAttachment.findUniqueOrThrow({
        where: { id: regulationAttachment.id },
        select: { state: true, stateReasonCode: true },
      }),
    ).resolves.toEqual({
      state: 'QUARANTINED',
      stateReasonCode: 'NATIVE_REFERENCE_REMOVED',
    });

    await services.knowledgeBase.updateArticle(user, article.id, {
      content: null,
    });
    await services.onboardingPlans.updatePlan(user, plan.id, { steps: [] });
    await services.checklists.updateChecklist(user, fixture.checklistRunA1Id, {
      answers: [
        {
          sectionId: 'section-a',
          itemId: 'item-a',
          evidenceAttachments: [],
        },
      ],
    });

    for (const expected of parentRows) {
      await expect(
        prisma.staffAttachment.findUniqueOrThrow({
          where: { id: expected.attachmentId },
          select: { state: true, stateReasonCode: true },
        }),
      ).resolves.toEqual({
        state: 'QUARANTINED',
        stateReasonCode: 'NATIVE_REFERENCE_REMOVED',
      });
      await expect(
        services.attachments.getAttachment(user, expected.attachmentId),
      ).rejects.toBeInstanceOf(NotFoundException);
    }

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

  it('rejects raw parent deletes that would orphan bound attachment authority', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const { attachments: service, bindings } = buildServices(prisma);
    const user = buildUser(fixture, 'A_NETWORK');
    const taskId = randomUUID();
    await prisma.staffTask.create({
      data: {
        id: taskId,
        tenantId: fixture.tenantAId,
        storeId: fixture.storeA1Id,
        createdByUserId: fixture.userANetworkId,
        title: `Attachment delete guard task ${randomUUID()}`,
      },
    });

    const parents = [
      [StaffAttachmentResourceKind.CHAT_MESSAGE, fixture.messageA1Id],
      [StaffAttachmentResourceKind.STAFF_TASK, taskId],
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
    await expect(
      countAttachmentParentDeleteGuardTriggers(prisma),
    ).resolves.toBe(parents.length);

    for (const [resourceKind, resourceId] of parents) {
      const attachment = await service.createAttachment(user, {
        originalname: `PG attachment fixture parent guard ${resourceKind} ${randomUUID()}.txt`,
        mimetype: 'text/plain',
        buffer: Buffer.from(`parent-guard-${resourceKind}`),
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
        prisma.$transaction((tx) =>
          deleteAttachmentParentRaw(tx, resourceKind, resourceId),
        ),
      ).rejects.toThrow(/Foreign key constraint|Staff attachment parent/);
      await expect(
        prisma.staffAttachmentBinding.count({
          where: {
            tenantId: fixture.tenantAId,
            attachmentId: attachment.id,
            resourceKind,
            resourceId,
            state: 'BOUND',
          },
        }),
      ).resolves.toBe(1);
    }

    const allowedAttachment = await service.createAttachment(user, {
      originalname: `PG attachment fixture parent guard allowed ${randomUUID()}.txt`,
      mimetype: 'text/plain',
      buffer: Buffer.from('parent-guard-allowed'),
    });
    const allowedCourse = await prisma.staffTrainingCourse.create({
      data: {
        tenantId: fixture.tenantAId,
        storeId: fixture.storeA1Id,
        createdByUserId: fixture.userANetworkId,
        title: `Attachment delete guard allowed ${randomUUID()}`,
        status: 'ACTIVE',
        steps: [],
      },
    });
    await prisma.$transaction((tx) =>
      bindings.bindPendingResourceAttachments(tx, {
        tenantId: fixture.tenantAId,
        actorUserId: fixture.userANetworkId,
        resourceKind: StaffAttachmentResourceKind.TRAINING_COURSE,
        resourceId: allowedCourse.id,
        attachmentIds: [allowedAttachment.id],
      }),
    );

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.staffAttachmentBinding.deleteMany({
          where: {
            tenantId: fixture.tenantAId,
            attachmentId: allowedAttachment.id,
            resourceKind: StaffAttachmentResourceKind.TRAINING_COURSE,
            resourceId: allowedCourse.id,
            state: 'BOUND',
          },
        });
        await tx.staffAttachment.update({
          where: { id: allowedAttachment.id },
          data: {
            state: 'QUARANTINED',
            pendingExpiresAt: null,
            stateReasonCode: 'NATIVE_REFERENCE_REMOVED',
            stateChangedAt: new Date(),
          },
        });
        await deleteAttachmentParentRaw(
          tx,
          StaffAttachmentResourceKind.TRAINING_COURSE,
          allowedCourse.id,
        );
      }),
    ).resolves.toBeUndefined();
    await expect(
      prisma.staffTrainingCourse.count({ where: { id: allowedCourse.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.staffAttachmentBinding.count({
        where: { attachmentId: allowedAttachment.id },
      }),
    ).resolves.toBe(0);
  });

  it('serializes native bind, unbind, and replacement races without orphan authority', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const services = buildServices(prisma);
    const user = buildUser(fixture, 'A_NETWORK');
    const sharedAttachment = await services.attachments.createAttachment(user, {
      originalname: `PG attachment fixture bind race ${randomUUID()}.txt`,
      mimetype: 'text/plain',
      buffer: Buffer.from('bind-race'),
    });
    const firstTitle = `Bind race first ${randomUUID()}`;
    const secondTitle = `Bind race second ${randomUUID()}`;
    const heldAttachment = await holdDatabaseLock(
      concurrentPrisma,
      async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          SELECT attachment."id"
          FROM "StaffAttachment" AS attachment
          WHERE attachment."id" = ${sharedAttachment.id}
            AND attachment."tenantId" = ${fixture.tenantAId}
          FOR UPDATE
        `);
      },
    );
    const firstCreate = observeOperation(
      services.trainingCourses.createCourse(user, {
        title: firstTitle,
        steps: [
          {
            title: 'Shared race attachment',
            type: 'LINK',
            url: sharedAttachment.url,
          },
        ],
      }),
    );
    const secondCreate = observeOperation(
      services.trainingCourses.createCourse(user, {
        title: secondTitle,
        steps: [
          {
            title: 'Shared race attachment',
            type: 'LINK',
            url: sharedAttachment.url,
          },
        ],
      }),
    );

    try {
      await expect(
        waitForBlockedOperation(prisma, heldAttachment.blockerPid, [
          firstCreate,
          secondCreate,
        ]),
      ).resolves.toBe(true);
    } finally {
      heldAttachment.release();
      await heldAttachment.finished;
    }

    const createResults = await Promise.all([
      firstCreate.result,
      secondCreate.result,
    ]);
    expect(createResults.filter((result) => result.ok)).toHaveLength(1);
    const rejectedCreate = createResults.find((result) => !result.ok);
    expect(rejectedCreate?.ok).toBe(false);
    if (rejectedCreate && !rejectedCreate.ok) {
      expect(rejectedCreate.error).toBeInstanceOf(BadRequestException);
    }

    const createdCourses = await prisma.staffTrainingCourse.findMany({
      where: {
        tenantId: fixture.tenantAId,
        title: { in: [firstTitle, secondTitle] },
      },
      select: { id: true, steps: true },
    });
    expect(createdCourses).toHaveLength(1);
    expect(JSON.stringify(createdCourses[0]?.steps)).toContain(
      sharedAttachment.url,
    );
    await expect(
      prisma.staffAttachmentBinding.findMany({
        where: {
          tenantId: fixture.tenantAId,
          attachmentId: sharedAttachment.id,
          state: 'BOUND',
        },
        select: { resourceKind: true, resourceId: true },
      }),
    ).resolves.toEqual([
      {
        resourceKind: StaffAttachmentResourceKind.TRAINING_COURSE,
        resourceId: createdCourses[0]?.id,
      },
    ]);

    const originalAttachment = await services.attachments.createAttachment(
      user,
      {
        originalname: `PG attachment fixture unbind race original ${randomUUID()}.txt`,
        mimetype: 'text/plain',
        buffer: Buffer.from('unbind-race-original'),
      },
    );
    const replacementAttachment = await services.attachments.createAttachment(
      user,
      {
        originalname: `PG attachment fixture unbind race replacement ${randomUUID()}.txt`,
        mimetype: 'text/plain',
        buffer: Buffer.from('unbind-race-replacement'),
      },
    );
    const lifecycleCourse = await services.trainingCourses.createCourse(user, {
      title: `Unbind race course ${randomUUID()}`,
      steps: [
        {
          title: 'Original race attachment',
          type: 'LINK',
          url: originalAttachment.url,
        },
      ],
    });
    const heldParent = await holdDatabaseLock(concurrentPrisma, async (tx) => {
      await tx.$queryRaw(Prisma.sql`
          SELECT course."id"
          FROM "StaffTrainingCourse" AS course
          WHERE course."id" = ${lifecycleCourse.id}
            AND course."tenantId" = ${fixture.tenantAId}
          FOR UPDATE
        `);
    });
    const remove = observeOperation(
      services.trainingCourses.updateCourse(user, lifecycleCourse.id, {
        steps: [],
      }),
    );
    const replace = observeOperation(
      services.trainingCourses.updateCourse(user, lifecycleCourse.id, {
        steps: [
          {
            title: 'Replacement race attachment',
            type: 'LINK',
            url: replacementAttachment.url,
          },
        ],
      }),
    );

    try {
      await expect(
        waitForBlockedOperation(prisma, heldParent.blockerPid, [
          remove,
          replace,
        ]),
      ).resolves.toBe(true);
    } finally {
      heldParent.release();
      await heldParent.finished;
    }

    const lifecycleResults = await Promise.all([remove.result, replace.result]);
    expect(lifecycleResults.map((result) => result.ok)).toEqual([true, true]);
    const finalCourse = await prisma.staffTrainingCourse.findUniqueOrThrow({
      where: { id: lifecycleCourse.id },
      select: { steps: true },
    });
    const finalHasReplacement = JSON.stringify(finalCourse.steps).includes(
      replacementAttachment.url,
    );
    const finalBindings = await prisma.staffAttachmentBinding.findMany({
      where: {
        tenantId: fixture.tenantAId,
        resourceKind: StaffAttachmentResourceKind.TRAINING_COURSE,
        resourceId: lifecycleCourse.id,
        state: 'BOUND',
      },
      select: { attachmentId: true },
    });
    expect(finalBindings).toEqual(
      finalHasReplacement ? [{ attachmentId: replacementAttachment.id }] : [],
    );
    await expect(
      prisma.staffAttachment.findUniqueOrThrow({
        where: { id: originalAttachment.id },
        select: { state: true, stateReasonCode: true },
      }),
    ).resolves.toEqual({
      state: 'QUARANTINED',
      stateReasonCode: 'NATIVE_REFERENCE_REMOVED',
    });
    await expect(
      prisma.staffAttachment.findUniqueOrThrow({
        where: { id: replacementAttachment.id },
        select: { state: true, stateReasonCode: true },
      }),
    ).resolves.toEqual(
      finalHasReplacement
        ? { state: 'BOUND', stateReasonCode: null }
        : {
            state: 'QUARANTINED',
            stateReasonCode: 'NATIVE_REFERENCE_REMOVED',
          },
    );

    const forbiddenRebindTitle = `Quarantined rebind ${randomUUID()}`;
    await expect(
      services.trainingCourses.createCourse(user, {
        title: forbiddenRebindTitle,
        steps: [
          {
            title: 'Quarantined original attachment',
            type: 'LINK',
            url: originalAttachment.url,
          },
        ],
      }),
    ).rejects.toThrow('Attachment is not available');
    await expect(
      prisma.staffTrainingCourse.count({
        where: {
          tenantId: fixture.tenantAId,
          title: forbiddenRebindTitle,
        },
      }),
    ).resolves.toBe(0);
  });

  it('denies attachment bytes when persisted user authority is revoked first', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const services = buildServices(prisma);
    const user = buildUser(fixture, 'A_NETWORK');
    const attachment = await services.attachments.createAttachment(user, {
      originalname: `PG attachment fixture scope revoke ${randomUUID()}.txt`,
      mimetype: 'text/plain',
      buffer: Buffer.from('scope-revoke-race'),
    });
    const article = await services.knowledgeBase.createArticle(user, {
      title: `Scope revoke article ${randomUUID()}`,
      content: `<a href="${attachment.url}">Protected attachment</a>`,
    });
    await expect(
      services.attachments.getAttachment(user, attachment.id),
    ).resolves.toEqual(
      expect.objectContaining({ buffer: Buffer.from('scope-revoke-race') }),
    );

    const heldRevocation = await holdDatabaseLock(
      concurrentPrisma,
      async (tx) => {
        await tx.user.update({
          where: { id: fixture.userANetworkId },
          data: { isActive: false },
        });
      },
    );
    const download = observeOperation(
      services.attachments.getAttachment(user, attachment.id),
    );

    try {
      await expect(
        waitForBlockedOperation(prisma, heldRevocation.blockerPid, [download]),
      ).resolves.toBe(true);
    } finally {
      heldRevocation.release();
      await heldRevocation.finished;
    }

    const result = await download.result;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    }
    await expect(
      prisma.staffAttachmentBinding.count({
        where: {
          tenantId: fixture.tenantAId,
          attachmentId: attachment.id,
          resourceKind: StaffAttachmentResourceKind.KNOWLEDGE_ARTICLE,
          resourceId: article.id,
          state: 'BOUND',
        },
      }),
    ).resolves.toBe(1);
  });

  it('denies attachment bytes when custom or system role capabilities are revoked first', async () => {
    const fixture = await createFixture(prisma);
    rememberFixture(fixtureTenantIds, fixture);
    const services = buildServices(prisma);
    const customRoleId = randomUUID();
    const customRolePermissions = [
      'view_staff_knowledge',
      'edit_staff_knowledge',
    ];
    const customPermissions = resolveUserCapabilities({
      role: UserRole.CLUB_ADMINISTRATOR,
      customRole: { permissions: customRolePermissions },
    });
    await prisma.userAccessRole.create({
      data: {
        id: customRoleId,
        tenantId: fixture.tenantAId,
        name: `Attachment custom role ${randomUUID()}`,
        permissions: customRolePermissions,
      },
    });
    await prisma.user.update({
      where: { id: fixture.userANetworkId },
      data: {
        role: UserRole.CLUB_ADMINISTRATOR,
        customRoleId,
      },
    });
    const customUser: AuthenticatedUser = {
      ...buildUser(fixture, 'A_NETWORK'),
      role: UserRole.CLUB_ADMINISTRATOR,
      customRoleId,
      permissions: customPermissions,
    };
    const customAttachment = await services.attachments.createAttachment(
      customUser,
      {
        originalname: `PG attachment fixture custom role revoke ${randomUUID()}.txt`,
        mimetype: 'text/plain',
        buffer: Buffer.from('custom-role-revoke-race'),
      },
    );
    await services.knowledgeBase.createArticle(customUser, {
      title: `Custom role revoke article ${randomUUID()}`,
      content: `<a href="${customAttachment.url}">Protected attachment</a>`,
    });
    const heldCustomRevoke = await holdDatabaseLock(
      concurrentPrisma,
      async (tx) => {
        await lockUserRoleAuthority(tx, {
          tenantId: fixture.tenantAId,
          role: UserRole.CLUB_ADMINISTRATOR,
          customRoleId,
        });
        await tx.userAccessRole.update({
          where: { id: customRoleId },
          data: { permissions: [] },
        });
      },
    );
    const customDownload = observeOperation(
      services.attachments.getAttachment(customUser, customAttachment.id),
    );

    try {
      await expect(
        waitForBlockedOperation(prisma, heldCustomRevoke.blockerPid, [
          customDownload,
        ]),
      ).resolves.toBe(true);
    } finally {
      heldCustomRevoke.release();
      await heldCustomRevoke.finished;
    }

    const customResult = await customDownload.result;
    expect(customResult.ok).toBe(false);
    if (!customResult.ok) {
      expect(customResult.error).toBeInstanceOf(UnauthorizedException);
    }

    const systemPermissions = resolveUserCapabilities({
      role: UserRole.CLUB_MANAGER,
    });
    await prisma.user.update({
      where: { id: fixture.userANetworkId },
      data: { customRoleId: null, role: UserRole.CLUB_MANAGER },
    });
    await prisma.userRoleOverride.upsert({
      where: {
        tenantId_role: {
          tenantId: fixture.tenantAId,
          role: UserRole.CLUB_MANAGER,
        },
      },
      create: {
        tenantId: fixture.tenantAId,
        role: UserRole.CLUB_MANAGER,
        permissions: systemPermissions,
      },
      update: { permissions: systemPermissions },
    });
    const systemUser: AuthenticatedUser = {
      ...buildUser(fixture, 'A_NETWORK'),
      role: UserRole.CLUB_MANAGER,
      customRoleId: null,
      permissions: systemPermissions,
    };
    const systemAttachment = await services.attachments.createAttachment(
      systemUser,
      {
        originalname: `PG attachment fixture system role revoke ${randomUUID()}.txt`,
        mimetype: 'text/plain',
        buffer: Buffer.from('system-role-revoke-race'),
      },
    );
    await services.knowledgeBase.createArticle(systemUser, {
      title: `System role revoke article ${randomUUID()}`,
      content: `<a href="${systemAttachment.url}">Protected attachment</a>`,
    });
    const heldSystemRevoke = await holdDatabaseLock(
      concurrentPrisma,
      async (tx) => {
        await lockUserRoleAuthority(tx, {
          tenantId: fixture.tenantAId,
          role: UserRole.CLUB_MANAGER,
          customRoleId: null,
        });
        await tx.userRoleOverride.update({
          where: {
            tenantId_role: {
              tenantId: fixture.tenantAId,
              role: UserRole.CLUB_MANAGER,
            },
          },
          data: { permissions: [] },
        });
      },
    );
    const systemDownload = observeOperation(
      services.attachments.getAttachment(systemUser, systemAttachment.id),
    );

    try {
      await expect(
        waitForBlockedOperation(prisma, heldSystemRevoke.blockerPid, [
          systemDownload,
        ]),
      ).resolves.toBe(true);
    } finally {
      heldSystemRevoke.release();
      await heldSystemRevoke.finished;
    }

    const systemResult = await systemDownload.result;
    expect(systemResult.ok).toBe(false);
    if (!systemResult.ok) {
      expect(systemResult.error).toBeInstanceOf(UnauthorizedException);
    }
  });
});

async function holdDatabaseLock(
  prismaClient: PrismaClient,
  lock: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<HeldDatabaseLock> {
  let releaseLock: () => void = () => undefined;
  let resolveReady: (pid: number) => void = () => undefined;
  let rejectReady: (reason?: unknown) => void = () => undefined;
  const releasePromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const readyPromise = new Promise<number>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const finished = prismaClient
    .$transaction(
      async (tx) => {
        const [backend] = await tx.$queryRaw<Array<{ pid: number }>>(
          Prisma.sql`SELECT pg_backend_pid()::int AS pid`,
        );
        await lock(tx);
        resolveReady(backend.pid);
        await releasePromise;
      },
      { timeout: 15_000 },
    )
    .catch((error: unknown) => {
      rejectReady(error);
      throw error;
    });

  return {
    blockerPid: await readyPromise,
    release: releaseLock,
    finished,
  };
}

function observeOperation<T>(promise: Promise<T>) {
  let settled = false;
  const result = promise.then<OperationResult<T>>(
    (value) => {
      settled = true;
      return { ok: true, value };
    },
    (error: unknown) => {
      settled = true;
      return { ok: false, error };
    },
  );

  return {
    isSettled: () => settled,
    result,
  };
}

async function waitForBlockedOperation(
  prismaClient: PrismaClient,
  blockerPid: number,
  operations: Array<{ isSettled: () => boolean }>,
) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    if (operations.every((operation) => operation.isSettled())) {
      return false;
    }

    const [row] = await prismaClient.$queryRaw<Array<{ blocked: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity AS activity
          WHERE activity.datname = current_database()
            AND ${blockerPid} = ANY(pg_blocking_pids(activity.pid))
        ) AS blocked
      `,
    );

    if (row.blocked) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return false;
}

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
  const knowledgeAccessPolicy = new StaffKnowledgeAccessPolicyService(
    freshStoreScopeService,
  );
  const checklistAccessPolicy = new StaffChecklistAccessPolicyService(
    freshStoreScopeService,
  );
  const shiftRegulationAccessPolicy =
    new StaffShiftRegulationAccessPolicyService(freshStoreScopeService);
  const trainingAccessPolicy = new StaffTrainingAccessPolicyService(
    freshStoreScopeService,
  );

  return {
    attachments: new StaffAttachmentsService(
      prisma,
      new ConfigService({ STAFF_ATTACHMENT_ACL_MODE: 'ENFORCED' }),
      tenantContext,
      teamChat,
      staffTasks,
      freshStoreScopeService,
      checklistAccessPolicy,
      knowledgeAccessPolicy,
      shiftRegulationAccessPolicy,
      trainingAccessPolicy,
    ),
    bindings,
    shiftRegulations: new StaffShiftRegulationsService(
      prisma,
      shiftRegulationAccessPolicy,
      notificationChat,
      bindings,
    ),
    knowledgeBase: new StaffKnowledgeBaseService(
      prisma,
      bindings,
      knowledgeAccessPolicy,
    ),
    trainingCourses: new StaffTrainingCoursesService(
      prisma,
      trainingAccessPolicy,
      notificationChat,
      bindings,
    ),
    trainingProfiles: new StaffTrainingProfilesService(
      prisma,
      trainingAccessPolicy,
    ),
    onboardingPlans: new StaffOnboardingPlansService(
      prisma,
      trainingAccessPolicy,
      bindings,
    ),
    checklistTemplates: new StaffChecklistTemplatesService(
      prisma,
      checklistAccessPolicy,
    ),
    checklists: new StaffChecklistsService(
      prisma,
      checklistAccessPolicy,
      bindings,
    ),
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
        sections: validRegulationSections('fixture-a1'),
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

async function countAttachmentParentDeleteGuardTriggers(prisma: PrismaClient) {
  const [row] = await prisma.$queryRaw<Array<{ triggerCount: number }>>(
    Prisma.sql`
      SELECT COUNT(*)::INTEGER AS "triggerCount"
      FROM pg_catalog.pg_trigger AS trigger
      WHERE NOT trigger.tgisinternal
        AND trigger.tgname IN (
          'StaffAttachmentBinding_chat_message_parent_delete_check',
          'StaffAttachmentBinding_staff_task_parent_delete_check',
          'StaffAttachmentBinding_checklist_run_parent_delete_check',
          'StaffAttachmentBinding_knowledge_article_parent_delete_check',
          'StaffAttachmentBinding_shift_regulation_parent_delete_check',
          'StaffAttachmentBinding_training_course_parent_delete_check',
          'StaffAttachmentBinding_onboarding_plan_parent_delete_check'
        )
        AND pg_catalog.pg_get_triggerdef(trigger.oid) LIKE
          '%assert_staff_attachment_parent_delete%'
    `,
  );

  return row?.triggerCount ?? 0;
}

function deleteAttachmentParentRaw(
  tx: Prisma.TransactionClient,
  resourceKind: StaffAttachmentResourceKind,
  resourceId: string,
) {
  switch (resourceKind) {
    case StaffAttachmentResourceKind.CHAT_MESSAGE:
      return tx.$executeRaw(
        Prisma.sql`DELETE FROM "StaffChatMessage" WHERE "id" = ${resourceId}`,
      );
    case StaffAttachmentResourceKind.STAFF_TASK:
      return tx.$executeRaw(
        Prisma.sql`DELETE FROM "StaffTask" WHERE "id" = ${resourceId}`,
      );
    case StaffAttachmentResourceKind.CHECKLIST_RUN:
      return tx.$executeRaw(
        Prisma.sql`DELETE FROM "StaffChecklistRun" WHERE "id" = ${resourceId}`,
      );
    case StaffAttachmentResourceKind.KNOWLEDGE_ARTICLE:
      return tx.$executeRaw(
        Prisma.sql`DELETE FROM "StaffKnowledgeArticle" WHERE "id" = ${resourceId}`,
      );
    case StaffAttachmentResourceKind.SHIFT_REGULATION:
      return tx.$executeRaw(
        Prisma.sql`DELETE FROM "StaffShiftRegulation" WHERE "id" = ${resourceId}`,
      );
    case StaffAttachmentResourceKind.TRAINING_COURSE:
      return tx.$executeRaw(
        Prisma.sql`DELETE FROM "StaffTrainingCourse" WHERE "id" = ${resourceId}`,
      );
    case StaffAttachmentResourceKind.ONBOARDING_PLAN:
      return tx.$executeRaw(
        Prisma.sql`DELETE FROM "StaffOnboardingPlan" WHERE "id" = ${resourceId}`,
      );
  }
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
    prisma.staffChecklistTemplate.deleteMany({ where: { tenantId } }),
    prisma.staffTask.deleteMany({ where: { tenantId } }),
    prisma.staffTaskTemplate.deleteMany({ where: { tenantId } }),
    prisma.staffKnowledgeArticle.deleteMany({ where: { tenantId } }),
    prisma.staffShiftRegulation.deleteMany({ where: { tenantId } }),
    prisma.staffAssessment.deleteMany({ where: { tenantId } }),
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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

type ControllerBoundary = Readonly<{
  source: string;
  className: string;
  routeIds: readonly string[];
}>;

type MethodBoundary = Readonly<{
  methodName: string;
  routeId: string;
}>;

const SOURCE_ROOT = resolve(__dirname, '..');
const HTTP_METHODS = new Map([
  ['Get', 'GET'],
  ['Sse', 'GET'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Patch', 'PATCH'],
  ['Delete', 'DELETE'],
]);

const CONTROLLER_BOUNDARIES: readonly ControllerBoundary[] = [
  {
    source: 'staff/staff-assessments.controller.ts',
    className: 'StaffAssessmentsController',
    routeIds: [
      'GET /staff/assessments',
      'PATCH /staff/assessments/:id',
      'POST /staff/assessments',
      'POST /staff/assessments/:id/results',
    ],
  },
  {
    source: 'staff/staff-checklist-templates.controller.ts',
    className: 'StaffChecklistTemplatesController',
    routeIds: [
      'DELETE /staff/checklist-templates/:id',
      'GET /staff/checklist-templates',
      'PATCH /staff/checklist-templates/:id',
      'POST /staff/checklist-templates',
    ],
  },
  {
    source: 'staff/staff-checklists.controller.ts',
    className: 'StaffChecklistsController',
    routeIds: [
      'GET /staff/checklists',
      'GET /staff/checklists/report',
      'GET /staff/checklists/report/export',
      'PATCH /staff/checklists/:id',
      'POST /staff/checklists',
      'POST /staff/checklists/:id/items/:itemId/review-messages',
      'POST /staff/checklists/:id/items/:itemId/review-resolve',
    ],
  },
  {
    source: 'staff/staff-discipline.controller.ts',
    className: 'StaffDisciplineController',
    routeIds: [
      'GET /staff/discipline',
      'GET /staff/discipline/export',
      'PATCH /staff/discipline/policy',
      'PATCH /staff/discipline/records/:id',
      'POST /staff/discipline/records',
    ],
  },
  {
    source: 'staff/staff-discipline.controller.ts',
    className: 'StaffAdministratorRatingsController',
    routeIds: ['GET /staff/administrator-ratings'],
  },
  {
    source: 'staff/staff-onboarding-plans.controller.ts',
    className: 'StaffOnboardingPlansController',
    routeIds: [
      'GET /staff/onboarding',
      'PATCH /staff/onboarding/:id',
      'POST /staff/onboarding',
    ],
  },
  {
    source: 'staff/staff-readiness-report.controller.ts',
    className: 'StaffReadinessReportController',
    routeIds: ['GET /staff/readiness-report'],
  },
  {
    source: 'staff/staff-salary.controller.ts',
    className: 'StaffSalaryController',
    routeIds: [
      'GET /staff/salary',
      'PATCH /staff/salary/periods/:id/rows/:userId',
      'PATCH /staff/salary/schemes/:id',
      'POST /staff/salary/periods',
      'POST /staff/salary/schemes',
    ],
  },
  {
    source: 'staff/staff-ai-assistant.controller.ts',
    className: 'StaffAiAssistantController',
    routeIds: ['GET /staff/ai-assistant'],
  },
  {
    source: 'staff/staff-operations-dashboard.controller.ts',
    className: 'StaffOperationsDashboardController',
    routeIds: ['GET /staff/operations-dashboard'],
  },
  {
    source: 'staff/staff-shift-workspace.controller.ts',
    className: 'StaffShiftWorkspaceController',
    routeIds: ['GET /staff/shift-workspace/profile'],
  },
] as const;

const STAFF_CONTROL_METHOD_BOUNDARIES: readonly MethodBoundary[] = [
  {
    methodName: 'getStaffControlFilterOptions',
    routeId: 'GET /guests/staff-control/filter-options',
  },
  {
    methodName: 'getStaffControl',
    routeId: 'GET /guests/staff-control',
  },
  {
    methodName: 'getStaffOperators',
    routeId: 'GET /guests/staff-control/operators',
  },
  {
    methodName: 'exportStaffOperators',
    routeId: 'GET /guests/staff-control/operators/export',
  },
  {
    methodName: 'getStaffOperations',
    routeId: 'GET /guests/staff-control/operations',
  },
  {
    methodName: 'exportStaffOperations',
    routeId: 'GET /guests/staff-control/operations/export',
  },
  {
    methodName: 'mapStaffIdentity',
    routeId: 'POST /guests/staff-control/identity-mappings',
  },
  {
    methodName: 'getStaffIdentityMappingEvents',
    routeId: 'GET /guests/staff-control/identity-mappings/events',
  },
  {
    methodName: 'rollbackStaffIdentityMappingEvent',
    routeId: 'POST /guests/staff-control/identity-mappings/events/:id/rollback',
  },
  {
    methodName: 'unmapStaffIdentity',
    routeId: 'DELETE /guests/staff-control/identity-mappings/:id',
  },
] as const;

const COMMUNICATIONS_STORE_BOUNDARIES: readonly ControllerBoundary[] = [
  {
    source: 'staff/staff-notifications.controller.ts',
    className: 'StaffNotificationsController',
    routeIds: [
      'GET /staff/notifications',
      'POST /staff/notifications/:id/acknowledge',
      'POST /staff/notifications/:id/resolve',
      'POST /staff/notifications/sync-signals',
    ],
  },
  {
    source: 'staff/staff-team-chat.controller.ts',
    className: 'StaffTeamChatController',
    routeIds: [
      'GET /staff/team-chat',
      'GET /staff/team-chat/events',
      'PATCH /staff/team-chat/messages/:id',
      'POST /staff/team-chat/channels',
      'POST /staff/team-chat/messages',
      'POST /staff/team-chat/read',
    ],
  },
] as const;

const STAFF_STORE_BOUNDARIES: readonly ControllerBoundary[] = [
  {
    source: 'staff/staff-attachments.controller.ts',
    className: 'StaffAttachmentsController',
    routeIds: ['GET /staff/attachments/:id', 'POST /staff/attachments'],
  },
  {
    source: 'staff/staff-directory.controller.ts',
    className: 'StaffDirectoryController',
    routeIds: [
      'GET /staff/directory',
      'GET /staff/directory/:id',
      'GET /staff/directory/active-shifts',
      'PATCH /staff/directory/:id',
      'POST /staff/directory',
    ],
  },
  {
    source: 'staff/staff-shift-reports.controller.ts',
    className: 'StaffShiftReportsController',
    routeIds: [
      'GET /staff/shift-reports/draft',
      'POST /staff/shift-reports/send',
    ],
  },
  {
    source: 'staff/staff-task-recurring-rules.controller.ts',
    className: 'StaffTaskRecurringRulesController',
    routeIds: [
      'GET /staff/task-rules',
      'PATCH /staff/task-rules/:id',
      'POST /staff/task-rules',
      'POST /staff/task-rules/:id/tasks',
      'POST /staff/task-rules/run-due',
    ],
  },
  {
    source: 'staff/staff-task-templates.controller.ts',
    className: 'StaffTaskTemplatesController',
    routeIds: [
      'GET /staff/task-templates',
      'PATCH /staff/task-templates/:id',
      'POST /staff/task-templates',
      'POST /staff/task-templates/:id/tasks',
    ],
  },
  {
    source: 'staff/staff-tasks.controller.ts',
    className: 'StaffTasksController',
    routeIds: [
      'GET /staff/tasks',
      'GET /staff/tasks/export',
      'PATCH /staff/tasks/:id',
      'POST /staff/tasks',
      'POST /staff/tasks/:id/comments',
    ],
  },
] as const;

const ADOPTED_STAFF_STORE_BOUNDARIES: readonly ControllerBoundary[] = [
  {
    source: 'staff/staff-knowledge-base.controller.ts',
    className: 'StaffKnowledgeBaseController',
    routeIds: [
      'GET /staff/knowledge-base',
      'GET /staff/knowledge-base/settings',
      'PATCH /staff/knowledge-base/:id',
      'POST /staff/knowledge-base',
      'POST /staff/knowledge-base/:id/read-receipts',
      'PUT /staff/knowledge-base/settings',
    ],
  },
  {
    source: 'staff/staff-shift-regulations.controller.ts',
    className: 'StaffShiftRegulationsController',
    routeIds: [
      'DELETE /staff/shift-regulations/:id',
      'GET /staff/shift-regulations',
      'PATCH /staff/shift-regulations/:id',
      'POST /staff/shift-regulations',
      'POST /staff/shift-regulations/:id/acknowledgements',
    ],
  },
  {
    source: 'staff/staff-training-courses.controller.ts',
    className: 'StaffTrainingCoursesController',
    routeIds: [
      'GET /staff/training-courses',
      'PATCH /staff/training-courses/:id',
      'POST /staff/training-courses',
    ],
  },
  {
    source: 'staff/staff-training-profiles.controller.ts',
    className: 'StaffTrainingProfilesController',
    routeIds: [
      'GET /staff/training-profiles',
      'GET /staff/training-profiles/export',
      'PATCH /staff/training-profiles/progress',
    ],
  },
] as const;

const TEAM_CHAT_FRESH_SCOPE_METHODS = [
  'getReport',
  'getLiveState',
  'createChannel',
  'createMessage',
  'canReadAnyAttachmentMessage',
  'updateMessage',
  'markRead',
] as const;

function decorators(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorCall(
  node: ts.Node,
  decoratorName: string,
): ts.CallExpression | undefined {
  for (const decorator of decorators(node)) {
    if (!ts.isCallExpression(decorator.expression)) {
      continue;
    }
    const expression = decorator.expression.expression;
    if (ts.isIdentifier(expression) && expression.text === decoratorName) {
      return decorator.expression;
    }
  }
  return undefined;
}

function literalArgument(call: ts.CallExpression | undefined): string {
  const argument = call?.arguments[0];
  if (!argument) {
    return '';
  }
  if (
    !ts.isStringLiteral(argument) &&
    !ts.isNoSubstitutionTemplateLiteral(argument)
  ) {
    throw new Error('Pilot boundary route decorators must use literal paths');
  }
  return argument.text;
}

function parseSource(source: string): ts.SourceFile {
  const absolute = resolve(SOURCE_ROOT, source);
  return ts.createSourceFile(
    absolute,
    readFileSync(absolute, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function classDeclaration(
  sourceFile: ts.SourceFile,
  className: string,
): ts.ClassDeclaration {
  const matches = sourceFile.statements.filter(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === className,
  );
  if (matches.length !== 1) {
    throw new Error(`Expected one ${className}; found ${matches.length}`);
  }
  return matches[0];
}

function guardNames(node: ts.Node): readonly string[] {
  const useGuards = decoratorCall(node, 'UseGuards');
  if (!useGuards) {
    return [];
  }
  return useGuards.arguments.map((argument) =>
    ts.isIdentifier(argument) ? argument.text : argument.getText(),
  );
}

function classRouteIds(node: ts.ClassDeclaration): readonly string[] {
  const prefix = literalArgument(decoratorCall(node, 'Controller'));
  const ids: string[] = [];

  for (const member of node.members) {
    if (!ts.isMethodDeclaration(member)) {
      continue;
    }
    ids.push(...methodRouteIds(prefix, member));
  }

  return ids.sort();
}

function methodRouteIds(
  prefix: string,
  member: ts.MethodDeclaration,
): readonly string[] {
  const ids: string[] = [];
  for (const [decoratorName, method] of HTTP_METHODS) {
    const route = decoratorCall(member, decoratorName);
    if (!route) {
      continue;
    }
    const suffix = literalArgument(route);
    const path = `/${[prefix, suffix].filter(Boolean).join('/')}`;
    ids.push(`${method} ${path}`);
  }
  return ids;
}

function namedMethod(
  node: ts.ClassDeclaration,
  methodName: string,
): ts.MethodDeclaration {
  const matches = node.members.filter(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === methodName,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected one method ${methodName}; found ${matches.length}`,
    );
  }
  return matches[0];
}

describe('Gate 1MT staff scope boundaries', () => {
  it('binds exactly 33 staff workspace routes to a fresh NETWORK class guard', () => {
    const allRouteIds: string[] = [];

    for (const boundary of CONTROLLER_BOUNDARIES) {
      const source = parseSource(boundary.source);
      const controller = classDeclaration(source, boundary.className);

      expect(guardNames(controller)).toEqual([
        'JwtAuthGuard',
        'RolesGuard',
        'FreshNetworkScopeGuard',
      ]);
      expect(classRouteIds(controller)).toEqual([...boundary.routeIds].sort());
      allRouteIds.push(...boundary.routeIds);
    }

    expect(allRouteIds).toHaveLength(33);
    expect(new Set(allRouteIds).size).toBe(allRouteIds.length);
    expect(allRouteIds.some((id) => id.includes('/scheduled/'))).toBe(false);
  });

  it('binds only the ten staff-control methods on the mixed guests controller', () => {
    const source = parseSource('guests/guests.controller.ts');
    const controller = classDeclaration(source, 'GuestsController');
    const prefix = literalArgument(decoratorCall(controller, 'Controller'));

    for (const boundary of STAFF_CONTROL_METHOD_BOUNDARIES) {
      const method = namedMethod(controller, boundary.methodName);
      expect(guardNames(method)).toEqual(['FreshNetworkScopeGuard']);
      expect(methodRouteIds(prefix, method)).toEqual([boundary.routeId]);
    }

    const guardedMethods = controller.members
      .filter(ts.isMethodDeclaration)
      .filter((method) => guardNames(method).includes('FreshNetworkScopeGuard'))
      .filter((method) =>
        methodRouteIds(prefix, method).some((id) =>
          id.includes('/guests/staff-control'),
        ),
      )
      .map((method) =>
        ts.isIdentifier(method.name) ? method.name.text : method.name.getText(),
      )
      .sort();

    expect(guardedMethods).toEqual(
      STAFF_CONTROL_METHOD_BOUNDARIES.map(
        ({ methodName }) => methodName,
      ).sort(),
    );
  });

  it('keeps CRM, scheduled execution, and provider effects outside this slice', () => {
    const selected = [
      ...CONTROLLER_BOUNDARIES.flatMap(({ routeIds }) => routeIds),
      ...STAFF_CONTROL_METHOD_BOUNDARIES.map(({ routeId }) => routeId),
    ];

    expect(selected).toHaveLength(43);
    expect(
      selected.every(
        (id) =>
          !id.includes('/guests/crm/') &&
          !id.includes('/scheduled/') &&
          !id.includes('/email') &&
          !id.includes('/dispatch'),
      ),
    ).toBe(true);
  });

  it('keeps the NETWORK-only salary slice tenant-bound and free of provider calls', () => {
    const salary = parseSource('staff/staff-salary.service.ts').getFullText();

    expect(salary).toContain('where: { tenantId, id }');
    expect(salary).toContain('where: { tenantId, id: periodId }');
    expect(salary).toContain('where: { tenantId, id: storeId }');
    expect(salary).not.toMatch(
      /\b(?:HttpService|fetch|axios|sendMail|sendSms|dispatch)\s*[.(]/u,
    );
  });

  it('binds exactly ten in-app communications routes to fresh NETWORK or STORES authority', () => {
    const routeIds: string[] = [];

    for (const boundary of COMMUNICATIONS_STORE_BOUNDARIES) {
      const source = parseSource(boundary.source);
      const controller = classDeclaration(source, boundary.className);

      expect(guardNames(controller)).toEqual([
        'JwtAuthGuard',
        'RolesGuard',
        'FreshStoreScopeGuard',
      ]);
      expect(classRouteIds(controller)).toEqual([...boundary.routeIds].sort());
      routeIds.push(...boundary.routeIds);
    }

    expect(routeIds).toHaveLength(10);
    expect(new Set(routeIds).size).toBe(routeIds.length);
    expect(routeIds.every((id) => !id.includes('/guests/crm/'))).toBe(true);
  });

  it('re-attests team-chat scope inside every tenant-user service path before Prisma access', () => {
    const source = parseSource('staff/staff-team-chat.service.ts');
    const service = classDeclaration(source, 'StaffTeamChatService');

    for (const methodName of TEAM_CHAT_FRESH_SCOPE_METHODS) {
      const method = namedMethod(service, methodName);
      const body = method.body?.getText() ?? '';
      const freshScopeIndex = body.search(
        /await\s+this\.resolveFreshAccessScope\(\s*user/u,
      );
      const prismaIndex = body.indexOf('this.prisma');

      expect(freshScopeIndex).toBeGreaterThan(-1);
      if (prismaIndex !== -1) {
        expect(freshScopeIndex).toBeLessThan(prismaIndex);
      }
      expect(body).not.toContain('accessScopeService.resolve(user)');
      expect(body).not.toContain('tenantContextService.resolve(user)');
    }
  });

  it('binds all 23 store-aware staff routes to fresh NETWORK or STORES authority', () => {
    const routeIds: string[] = [];

    for (const boundary of STAFF_STORE_BOUNDARIES) {
      const source = parseSource(boundary.source);
      const controller = classDeclaration(source, boundary.className);

      expect(guardNames(controller)).toEqual([
        'JwtAuthGuard',
        'RolesGuard',
        'FreshStoreScopeGuard',
      ]);
      expect(classRouteIds(controller)).toEqual([...boundary.routeIds].sort());
      routeIds.push(...boundary.routeIds);
    }

    expect(routeIds).toHaveLength(23);
    expect(new Set(routeIds).size).toBe(routeIds.length);
  });

  it('binds all 17 adopted knowledge, regulation and training routes to fresh NETWORK or STORES authority', () => {
    const routeIds: string[] = [];

    for (const boundary of ADOPTED_STAFF_STORE_BOUNDARIES) {
      const source = parseSource(boundary.source);
      const controller = classDeclaration(source, boundary.className);

      expect(guardNames(controller)).toEqual([
        'JwtAuthGuard',
        'RolesGuard',
        'FreshStoreScopeGuard',
      ]);
      expect(classRouteIds(controller)).toEqual([...boundary.routeIds].sort());
      routeIds.push(...boundary.routeIds);
    }

    expect(routeIds).toHaveLength(17);
    expect(new Set(routeIds).size).toBe(routeIds.length);
  });
});

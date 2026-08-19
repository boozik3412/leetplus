import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../auth/auth.types';
import {
  accessCapabilityCatalog,
  type AccessCapability,
} from '../auth/capabilities';
import { RolesGuard } from '../auth/roles.guard';
import {
  PILOT_HTTP_MODULES,
  PILOT_HTTP_SURFACE_MANIFEST,
  type PilotHttpMethod,
} from './pilot-http-surface-manifest';
import { resolveTenantExecutionHttpAccess } from './tenant-execution-http-policy';

type SourceRoute = Readonly<{
  id: string;
  source: string;
}>;

type NetworkMutationBinding = Readonly<{
  id: string;
  source: string;
  method: string;
}>;

type UserScopeBinding = NetworkMutationBinding &
  Readonly<{
    assertion: string;
  }>;

const SOURCE_ROOT = resolve(__dirname, '..');
const WHOLE_SOURCE_DIRECTORIES = [
  'categories',
  'dashboard',
  'guest-gamification',
  'guest-portal',
  'imports',
  'products',
  'reports',
  'staff',
  'stores',
  'suppliers',
  'users',
  'utilities',
] as const;
const WHOLE_ROUTE_PREFIXES = [
  '/assortment',
  '/categories',
  '/communications',
  '/dashboard',
  '/game',
  '/gamification',
  '/guest-game',
  '/guest-portal',
  '/guests/gamification',
  '/imports',
  '/inventory',
  '/play',
  '/products',
  '/public/guest-game',
  '/reports',
  '/roles',
  '/staff',
  '/stores',
  '/suppliers',
  '/users',
  '/utilities',
] as const;
const GUESTS_PARTIAL_SOURCE = 'src/guests/guests.controller.ts';
const GUESTS_INCLUDED_PREFIXES = [
  '/guests/staff-control',
  '/guests/crm/tasks',
  '/guests/crm/users',
  '/guests/crm/contact-events',
] as const;
const PROVABLY_UNREGISTERED_CONTROLLER_SOURCES = new Set([
  'src/guest-portal/guest-portal-current190-candidate.controller.ts',
  'src/users/employee-invite-current189-candidate.controller.ts',
]);

const USER_SCOPE_BINDINGS: readonly UserScopeBinding[] = [
  ['GET /users', 'getUsers', 'resolve(user)'],
  ['POST /users/invites', 'createInvite', 'resolve(actor)'],
  ['PATCH /users/invites/:id', 'updateInvite', 'resolve(actor)'],
  ['DELETE /users/invites/:id', 'cancelInvite', 'resolve(actor)'],
  ['PATCH /users/:id', 'updateUser', 'resolve(actor)'],
  ['POST /users/roles', 'createAccessRole', 'assertNetwork(actor)'],
  ['PATCH /users/roles/:id', 'updateAccessRole', 'assertNetwork(actor)'],
  [
    'PATCH /users/system-roles/:role',
    'updateSystemRole',
    'assertNetwork(actor)',
  ],
].map(([id, method, assertion]) =>
  Object.freeze({
    assertion,
    id,
    method,
    source: 'src/users/users.service.ts',
  }),
);

const NETWORK_MUTATION_BINDINGS: readonly NetworkMutationBinding[] = [
  {
    id: 'POST /products',
    source: 'src/products/products.service.ts',
    method: 'create',
  },
  {
    id: 'PATCH /products/bulk-category',
    source: 'src/products/products.service.ts',
    method: 'assignCategoryToUncategorizedProducts',
  },
  {
    id: 'PATCH /products/:id',
    source: 'src/products/products.service.ts',
    method: 'update',
  },
  {
    id: 'DELETE /products/:id',
    source: 'src/products/products.service.ts',
    method: 'archive',
  },
  {
    id: 'POST /categories/langame/preview',
    source: 'src/categories/product-category-catalog.service.ts',
    method: 'previewLangameMappings',
  },
  {
    id: 'POST /categories/langame/apply',
    source: 'src/categories/product-category-catalog.service.ts',
    method: 'applyLangameMappings',
  },
  {
    id: 'POST /categories/merge',
    source: 'src/categories/categories.service.ts',
    method: 'merge',
  },
  {
    id: 'POST /categories',
    source: 'src/categories/categories.service.ts',
    method: 'create',
  },
  {
    id: 'PATCH /categories/:id',
    source: 'src/categories/categories.service.ts',
    method: 'update',
  },
  {
    id: 'DELETE /categories/:id',
    source: 'src/categories/categories.service.ts',
    method: 'remove',
  },
  {
    id: 'POST /suppliers',
    source: 'src/suppliers/suppliers.service.ts',
    method: 'create',
  },
  {
    id: 'PATCH /suppliers/:id',
    source: 'src/suppliers/suppliers.service.ts',
    method: 'update',
  },
  {
    id: 'DELETE /suppliers/:id',
    source: 'src/suppliers/suppliers.service.ts',
    method: 'archive',
  },
  {
    id: 'POST /stores',
    source: 'src/stores/stores.service.ts',
    method: 'create',
  },
  {
    id: 'PATCH /stores/:id',
    source: 'src/stores/stores.service.ts',
    method: 'update',
  },
  {
    id: 'DELETE /stores/:id',
    source: 'src/stores/stores.service.ts',
    method: 'archive',
  },
  {
    id: 'POST /reports/oos-exclusions',
    source: 'src/reports/reports.service.ts',
    method: 'createOosExclusion',
  },
  {
    id: 'DELETE /reports/oos-exclusions/:id',
    source: 'src/reports/reports.service.ts',
    method: 'deleteOosExclusion',
  },
  {
    id: 'PATCH /reports/recommendations/:key/state',
    source: 'src/reports/reports.service.ts',
    method: 'updateRecommendationState',
  },
  {
    id: 'POST /imports/products/preview',
    source: 'src/imports/product-csv-import.service.ts',
    method: 'preview',
  },
  {
    id: 'POST /imports/products',
    source: 'src/imports/product-csv-import.service.ts',
    method: 'import',
  },
  {
    id: 'POST /imports/inventory/preview',
    source: 'src/imports/fact-csv-import.service.ts',
    method: 'previewInventory',
  },
  {
    id: 'POST /imports/inventory',
    source: 'src/imports/fact-csv-import.service.ts',
    method: 'importInventory',
  },
  {
    id: 'POST /imports/sales/preview',
    source: 'src/imports/fact-csv-import.service.ts',
    method: 'previewSales',
  },
  {
    id: 'POST /imports/sales',
    source: 'src/imports/fact-csv-import.service.ts',
    method: 'importSales',
  },
  {
    id: 'POST /imports/movements/preview',
    source: 'src/imports/fact-csv-import.service.ts',
    method: 'previewStockMovements',
  },
  {
    id: 'POST /imports/movements',
    source: 'src/imports/fact-csv-import.service.ts',
    method: 'importStockMovements',
  },
  {
    id: 'POST /utilities/product-parsing/analyze',
    source: 'src/utilities/product-parsing.service.ts',
    method: 'analyze',
  },
  {
    id: 'POST /utilities/product-parsing/manual/groups',
    source: 'src/utilities/product-parsing.service.ts',
    method: 'createManualGroup',
  },
  {
    id: 'PATCH /utilities/product-parsing/manual/groups/:id',
    source: 'src/utilities/product-parsing.service.ts',
    method: 'updateManualGroup',
  },
  {
    id: 'POST /utilities/product-parsing/suggestions/:id/apply',
    source: 'src/utilities/product-parsing.service.ts',
    method: 'applySuggestion',
  },
  {
    id: 'POST /utilities/product-parsing/suggestions/:id/reject',
    source: 'src/utilities/product-parsing.service.ts',
    method: 'rejectSuggestion',
  },
] as const;

const STAFF_NETWORK_ROUTE_IDS = [
  'DELETE /guests/staff-control/identity-mappings/:id',
  'DELETE /staff/checklist-templates/:id',
  'GET /guests/staff-control',
  'GET /guests/staff-control/filter-options',
  'GET /guests/staff-control/identity-mappings/events',
  'GET /guests/staff-control/operations',
  'GET /guests/staff-control/operations/export',
  'GET /guests/staff-control/operators',
  'GET /guests/staff-control/operators/export',
  'GET /staff/administrator-ratings',
  'GET /staff/ai-assistant',
  'GET /staff/assessments',
  'GET /staff/checklist-templates',
  'GET /staff/checklists',
  'GET /staff/checklists/report',
  'GET /staff/checklists/report/export',
  'GET /staff/discipline',
  'GET /staff/discipline/export',
  'GET /staff/onboarding',
  'GET /staff/operations-dashboard',
  'GET /staff/readiness-report',
  'GET /staff/salary',
  'GET /staff/shift-workspace/profile',
  'PATCH /staff/assessments/:id',
  'PATCH /staff/checklist-templates/:id',
  'PATCH /staff/checklists/:id',
  'PATCH /staff/discipline/policy',
  'PATCH /staff/discipline/records/:id',
  'PATCH /staff/onboarding/:id',
  'PATCH /staff/salary/periods/:id/rows/:userId',
  'PATCH /staff/salary/schemes/:id',
  'POST /guests/staff-control/identity-mappings',
  'POST /guests/staff-control/identity-mappings/events/:id/rollback',
  'POST /staff/assessments',
  'POST /staff/assessments/:id/results',
  'POST /staff/checklist-templates',
  'POST /staff/checklists',
  'POST /staff/checklists/:id/items/:itemId/review-messages',
  'POST /staff/checklists/:id/items/:itemId/review-resolve',
  'POST /staff/discipline/records',
  'POST /staff/onboarding',
  'POST /staff/salary/periods',
  'POST /staff/salary/schemes',
] as const;

function normalizeSourcePath(file: string): string {
  return `src/${relative(SOURCE_ROOT, file).split(sep).join('/')}`;
}

function controllerFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...controllerFiles(absolute));
    } else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
      files.push(absolute);
    }
  }
  return files;
}

function moduleFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...moduleFiles(absolute));
    } else if (entry.isFile() && entry.name.endsWith('.module.ts')) {
      files.push(absolute);
    }
  }
  return files;
}

function assertControllerIsUnregistered(
  source: string,
  sourceFile: ts.SourceFile,
): void {
  const classNames = sourceFile.statements
    .filter(
      (statement): statement is ts.ClassDeclaration =>
        ts.isClassDeclaration(statement) &&
        statement.name !== undefined &&
        decoratorCall(statement, new Set(['Controller'])) !== null,
    )
    .map((statement) => statement.name!.text);
  if (classNames.length === 0) {
    throw new Error(`${source}: dormant controller class is missing`);
  }

  const importStem = source.replace(/^src\//u, '').replace(/\.ts$/u, '');
  for (const moduleFile of moduleFiles(SOURCE_ROOT)) {
    const moduleSource = ts.createSourceFile(
      moduleFile,
      readFileSync(moduleFile, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    let registeredReference = false;
    const visit = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        (node.moduleSpecifier.text.endsWith(importStem) ||
          node.moduleSpecifier.text.endsWith(
            importStem.slice(importStem.lastIndexOf('/')),
          ))
      ) {
        registeredReference = true;
      }
      if (ts.isIdentifier(node) && classNames.includes(node.text)) {
        registeredReference = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(moduleSource);
    if (registeredReference) {
      throw new Error(
        `${source}: dormant controller is referenced by ${normalizeSourcePath(
          moduleFile,
        )}`,
      );
    }
  }
}

function isPilotRoute(source: string, path: string): boolean {
  if (source === GUESTS_PARTIAL_SOURCE) {
    return GUESTS_INCLUDED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  }
  return (
    WHOLE_SOURCE_DIRECTORIES.some((directory) =>
      source.startsWith(`src/${directory}/`),
    ) ||
    WHOLE_ROUTE_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  );
}

function literalDecoratorArgument(
  call: ts.CallExpression,
  source: string,
): string {
  if (call.arguments.length === 0) {
    return '';
  }
  const [argument] = call.arguments;
  if (
    !ts.isStringLiteral(argument) &&
    !ts.isNoSubstitutionTemplateLiteral(argument)
  ) {
    throw new Error(
      `${source}: pilot controller decorators must use literal route paths`,
    );
  }
  return argument.text;
}

function decoratorCall(
  node: ts.Node,
  names: ReadonlySet<string>,
): { name: string; call: ts.CallExpression } | null {
  const decorators = ts.canHaveDecorators(node)
    ? (ts.getDecorators(node) ?? [])
    : [];
  for (const decorator of decorators) {
    if (!ts.isCallExpression(decorator.expression)) {
      continue;
    }
    const expression = decorator.expression.expression;
    if (ts.isIdentifier(expression) && names.has(expression.text)) {
      return { name: expression.text, call: decorator.expression };
    }
  }
  return null;
}

function joinRoute(prefix: string, localPath: string): string {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
  const cleanLocal = localPath.replace(/^\/+|\/+$/g, '');
  return `/${[cleanPrefix, cleanLocal].filter(Boolean).join('/')}`;
}

function sourceRoutes(): readonly SourceRoute[] {
  const routes: SourceRoute[] = [];
  const methodNames = new Set([
    'All',
    'Get',
    'Head',
    'Options',
    'Post',
    'Put',
    'Patch',
    'Delete',
    'Sse',
  ]);
  const methodByDecorator: Readonly<Record<string, PilotHttpMethod>> = {
    Get: 'GET',
    Sse: 'GET',
    Post: 'POST',
    Put: 'PUT',
    Patch: 'PATCH',
    Delete: 'DELETE',
  };

  for (const file of controllerFiles(SOURCE_ROOT)) {
    const source = normalizeSourcePath(file);
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    if (PROVABLY_UNREGISTERED_CONTROLLER_SOURCES.has(source)) {
      assertControllerIsUnregistered(source, sourceFile);
      continue;
    }

    sourceFile.forEachChild((node) => {
      if (!ts.isClassDeclaration(node)) {
        return;
      }
      const controller = decoratorCall(node, new Set(['Controller']));
      if (!controller) {
        return;
      }
      const prefix = literalDecoratorArgument(controller.call, source);
      for (const member of node.members) {
        const route = decoratorCall(member, methodNames);
        if (!route) {
          continue;
        }
        const path = joinRoute(
          prefix,
          literalDecoratorArgument(route.call, source),
        );
        if (!isPilotRoute(source, path)) {
          continue;
        }
        const method = methodByDecorator[route.name];
        if (!method) {
          throw new Error(
            `${source}: unsupported HTTP decorator ${route.name}`,
          );
        }
        routes.push({ source, id: `${method} ${path}` });
      }
    });
  }

  return routes.sort((left, right) =>
    `${left.source}\0${left.id}`.localeCompare(`${right.source}\0${right.id}`),
  );
}

function serviceMethodText(binding: NetworkMutationBinding): string {
  const file = resolve(SOURCE_ROOT, binding.source.replace(/^src\//u, ''));
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let match: ts.MethodDeclaration | undefined;

  sourceFile.forEachChild((node) => {
    if (!ts.isClassDeclaration(node)) {
      return;
    }
    for (const member of node.members) {
      if (
        ts.isMethodDeclaration(member) &&
        ts.isIdentifier(member.name) &&
        member.name.text === binding.method
      ) {
        if (match) {
          throw new Error(
            `${binding.source}: duplicate service method ${binding.method}`,
          );
        }
        match = member;
      }
    }
  });

  if (!match) {
    throw new Error(
      `${binding.source}: service method ${binding.method} was not found`,
    );
  }
  return match.getText(sourceFile);
}

function operatorUser(
  capabilities: readonly AccessCapability[],
): AuthenticatedUser {
  return {
    id: 'pilot-surface-user',
    email: 'pilot-surface@example.invalid',
    fullName: 'Pilot Surface',
    role: UserRole.OWNER,
    customRoleId: 'pilot-surface-custom-role',
    permissions: [...capabilities],
    isPlatformAdmin: false,
    tenantId: 'pilot-tenant',
    tenantSlug: 'pilot-tenant',
    accessScope: 'NETWORK',
    allowedStoreIds: [],
  };
}

function executionContext(
  method: PilotHttpMethod,
  path: string,
  user: AuthenticatedUser,
): ExecutionContext {
  const request = { method, path, user } as AuthenticatedRequest;
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
    getHandler: () => executionContext,
    getClass: () => RolesGuard,
    getType: () => 'http',
    getArgs: () => [request],
    getArgByIndex: () => request,
    switchToRpc: () => {
      throw new Error('RPC context is not supported by this fixture');
    },
    switchToWs: () => {
      throw new Error('WebSocket context is not supported by this fixture');
    },
  } as unknown as ExecutionContext;
}

describe('Gate 1MT pilot HTTP surface manifest', () => {
  it('pins the current aggregate decision after opening the bounded CRM communications slice', () => {
    const allowed = PILOT_HTTP_SURFACE_MANIFEST.filter(
      (entry) => entry.decision === 'ALLOW',
    );
    const blocked = PILOT_HTTP_SURFACE_MANIFEST.filter(
      (entry) => entry.decision === 'BLOCKED',
    );
    const outbound = PILOT_HTTP_SURFACE_MANIFEST.filter(
      (entry) => entry.effect === 'OUTBOUND',
    );

    expect(PILOT_HTTP_SURFACE_MANIFEST).toHaveLength(295);
    expect(allowed).toHaveLength(241);
    expect(blocked).toHaveLength(54);
    expect(outbound).toHaveLength(21);
    expect(
      PILOT_HTTP_SURFACE_MANIFEST.filter((entry) =>
        entry.gaps.includes('STORE_SCOPE_NOT_ENFORCED_WITH_ALLOWED_STORE_IDS'),
      ),
    ).toHaveLength(2);
    expect(
      PILOT_HTTP_SURFACE_MANIFEST.some((entry) =>
        entry.gaps.includes('CAPABILITY_MODULE_MISMATCH'),
      ),
    ).toBe(false);
    expect(
      PILOT_HTTP_SURFACE_MANIFEST.some((entry) =>
        entry.gaps.includes('HTTP_ENTITLEMENT_ROUTE_UNCLASSIFIED'),
      ),
    ).toBe(false);
  });

  it('opens exactly the freshly-scoped assortment reads and NETWORK mutations, with outbound still blocked', () => {
    const expected = [
      'DELETE /categories/:id',
      'DELETE /products/:id',
      'DELETE /reports/oos-exclusions/:id',
      'DELETE /stores/:id',
      'DELETE /suppliers/:id',
      'GET /categories',
      'GET /categories/langame/overview',
      'GET /dashboard/revenue-diagnostics',
      'GET /dashboard/summary',
      'GET /imports',
      'GET /products',
      'GET /products/:id',
      'GET /products/catalog',
      'GET /products/summary',
      'GET /reports/assortment',
      'GET /reports/assortment-matrix',
      'GET /reports/export',
      'GET /reports/inventory-turnover',
      'GET /reports/lfl',
      'GET /reports/new-products',
      'GET /reports/oos-exclusions',
      'GET /reports/operations',
      'GET /reports/plan-fact',
      'GET /reports/replenishment',
      'GET /reports/sales-detail',
      'GET /reports/sku-performance',
      'GET /reports/suppliers-performance',
      'GET /stores',
      'GET /suppliers',
      'GET /utilities/product-parsing',
      'GET /utilities/product-parsing/manual',
      'PATCH /categories/:id',
      'PATCH /products/:id',
      'PATCH /products/bulk-category',
      'PATCH /reports/recommendations/:key/state',
      'PATCH /stores/:id',
      'PATCH /suppliers/:id',
      'PATCH /utilities/product-parsing/manual/groups/:id',
      'POST /categories',
      'POST /categories/langame/apply',
      'POST /categories/langame/preview',
      'POST /categories/merge',
      'POST /imports/inventory',
      'POST /imports/inventory/preview',
      'POST /imports/movements',
      'POST /imports/movements/preview',
      'POST /imports/products',
      'POST /imports/products/preview',
      'POST /imports/sales',
      'POST /imports/sales/preview',
      'POST /products',
      'POST /stores',
      'POST /reports/oos-exclusions',
      'POST /suppliers',
      'POST /utilities/product-parsing/analyze',
      'POST /utilities/product-parsing/manual/groups',
      'POST /utilities/product-parsing/suggestions/:id/apply',
      'POST /utilities/product-parsing/suggestions/:id/reject',
    ].sort();
    const allowed = PILOT_HTTP_SURFACE_MANIFEST.filter(
      (entry) => entry.module === 'ASSORTMENT' && entry.decision === 'ALLOW',
    );

    expect(allowed.map((entry) => entry.id).sort()).toEqual(expected);
    expect(allowed.every((entry) => entry.effect !== 'OUTBOUND')).toBe(true);
    expect(
      allowed
        .filter((entry) => entry.effect === 'TENANT_WRITE')
        .every((entry) => entry.minimumScope === 'NETWORK'),
    ).toBe(true);
  });

  it('binds every allowed assortment mutation to a fresh NETWORK assertion in its service method', () => {
    const allowedMutationIds = PILOT_HTTP_SURFACE_MANIFEST.filter(
      (entry) =>
        entry.module === 'ASSORTMENT' &&
        entry.decision === 'ALLOW' &&
        entry.effect === 'TENANT_WRITE',
    )
      .map((entry) => entry.id)
      .sort();
    const bindings = [...NETWORK_MUTATION_BINDINGS].sort((left, right) =>
      left.id.localeCompare(right.id),
    );

    expect(allowedMutationIds).toEqual(bindings.map(({ id }) => id));
    for (const binding of bindings) {
      expect(serviceMethodText(binding)).toContain(
        'await this.freshStoreScopeService.assertNetwork(user)',
      );
    }
  });

  it('re-attests every users/roles path except intentionally disabled direct creation before service data access', () => {
    const users = PILOT_HTTP_SURFACE_MANIFEST.filter(
      (entry) => entry.module === 'USERS_ROLES',
    );
    expect(users).toHaveLength(9);
    expect(
      users
        .filter((entry) => entry.id !== 'POST /users')
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(USER_SCOPE_BINDINGS.map((binding) => binding.id).sort());
    for (const binding of USER_SCOPE_BINDINGS) {
      expect(serviceMethodText(binding)).toContain(
        `await this.freshStoreScopeService.${binding.assertion}`,
      );
    }
    expect(
      serviceMethodText({
        id: 'POST /users',
        method: 'createUser',
        source: 'src/users/users.service.ts',
      }),
    ).not.toContain('freshStoreScopeService');
  });

  it('opens exactly the fresh NETWORK staff slice and keeps scheduled execution blocked', () => {
    const staff = PILOT_HTTP_SURFACE_MANIFEST.filter(
      (entry) => entry.module === 'STAFF',
    );
    const allowed = staff.filter((entry) => entry.decision === 'ALLOW');
    const networkAllowed = allowed.filter(
      (entry) => entry.minimumScope === 'NETWORK',
    );

    expect(staff).toHaveLength(84);
    expect(allowed).toHaveLength(83);
    expect(networkAllowed.map(({ id }) => id).sort()).toEqual(
      [...STAFF_NETWORK_ROUTE_IDS].sort(),
    );
    expect(
      networkAllowed.every(
        (entry) =>
          entry.principal === 'TENANT_OPERATOR' &&
          entry.storeFilter === 'NOT_APPLICABLE' &&
          entry.effect !== 'OUTBOUND' &&
          entry.gaps.length === 0,
      ),
    ).toBe(true);
    expect(
      staff
        .filter((entry) => entry.decision === 'BLOCKED')
        .map(({ id }) => id)
        .sort(),
    ).toEqual(['POST /staff/task-rules/scheduled/run-due']);
  });

  it('opens exactly the NETWORK-only CRM contact-task slice under communications capabilities', () => {
    const communications = PILOT_HTTP_SURFACE_MANIFEST.filter(
      (entry) => entry.module === 'COMMUNICATIONS',
    );
    const crm = communications.filter((entry) =>
      entry.path.startsWith('/guests/crm/'),
    );

    expect(communications).toHaveLength(18);
    expect(
      communications.filter((entry) => entry.decision === 'ALLOW'),
    ).toHaveLength(18);
    expect(crm).toHaveLength(8);
    expect(
      crm.every(
        (entry) =>
          entry.decision === 'ALLOW' &&
          entry.minimumScope === 'NETWORK' &&
          entry.storeFilter === 'NOT_APPLICABLE' &&
          entry.entitlement === 'COMMUNICATIONS' &&
          entry.capability ===
            (entry.method === 'GET'
              ? 'view_communications'
              : 'manage_communications') &&
          entry.effect !== 'OUTBOUND' &&
          entry.gaps.length === 0,
      ),
    ).toBe(true);
  });

  it('opens only the NETWORK-guarded in-app gamification slice and keeps every outbound/public path blocked', () => {
    const gamification = PILOT_HTTP_SURFACE_MANIFEST.filter(
      (entry) => entry.module === 'GAMIFICATION',
    );
    const allowed = gamification.filter((entry) => entry.decision === 'ALLOW');

    expect(allowed).toHaveLength(77);
    expect(
      allowed.every(
        (entry) =>
          entry.principal === 'TENANT_OPERATOR' &&
          entry.minimumScope === 'NETWORK' &&
          entry.effect !== 'OUTBOUND' &&
          (entry.source ===
            'src/guest-gamification/guest-gamification.controller.ts' ||
            entry.source ===
              'src/guest-gamification/guest-game-media.controller.ts'),
      ),
    ).toBe(true);
    expect(
      gamification
        .filter(
          (entry) =>
            entry.effect === 'OUTBOUND' ||
            entry.principal !== 'TENANT_OPERATOR',
        )
        .every((entry) => entry.decision === 'BLOCKED'),
    ).toBe(true);
  });

  it('matches every selected controller handler exactly with no stale or missing rows', () => {
    const discovered = sourceRoutes();
    const manifest = PILOT_HTTP_SURFACE_MANIFEST.map(({ source, id }) => ({
      source,
      id,
    })).sort((left, right) =>
      `${left.source}\0${left.id}`.localeCompare(
        `${right.source}\0${right.id}`,
      ),
    );

    expect(manifest).toEqual(discovered);
  });

  it('excludes only the exact AST-proven unregistered candidate controllers', () => {
    expect([...PROVABLY_UNREGISTERED_CONTROLLER_SOURCES].sort()).toEqual([
      'src/guest-portal/guest-portal-current190-candidate.controller.ts',
      'src/users/employee-invite-current189-candidate.controller.ts',
    ]);
    expect(
      sourceRoutes().some((route) =>
        PROVABLY_UNREGISTERED_CONTROLLER_SOURCES.has(route.source),
      ),
    ).toBe(false);
  });

  it('is duplicate-free, immutable, and classifies every row completely', () => {
    expect(Object.isFrozen(PILOT_HTTP_SURFACE_MANIFEST)).toBe(true);
    expect(new Set(PILOT_HTTP_SURFACE_MANIFEST.map(({ id }) => id)).size).toBe(
      PILOT_HTTP_SURFACE_MANIFEST.length,
    );

    for (const entry of PILOT_HTTP_SURFACE_MANIFEST) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.gaps)).toBe(true);
      expect(PILOT_HTTP_MODULES).toContain(entry.module);
      expect(entry.entitlement).toBe(entry.module);
      expect(entry.id).toBe(`${entry.method} ${entry.path}`);
      expect(entry.path.startsWith('/')).toBe(true);
      if (entry.minimumScope === 'STORES') {
        expect(entry.storeFilter).toBe('REQUIRED');
      }
      if (entry.effect === 'OUTBOUND') {
        expect(entry.decision).toBe('BLOCKED');
        expect(entry.gaps).toContain('OUTBOUND_DEFAULT_OFF');
      }
      if (entry.decision === 'ALLOW') {
        expect(entry.principal).toBe('TENANT_OPERATOR');
        expect(entry.effect).not.toBe('OUTBOUND');
        expect(entry.gaps).toEqual([]);
      } else {
        expect(entry.gaps.length).toBeGreaterThan(0);
      }
    }
  });

  it('uses only catalog capabilities for tenant operators', () => {
    const catalog = new Set(accessCapabilityCatalog.map(({ key }) => key));
    for (const entry of PILOT_HTTP_SURFACE_MANIFEST) {
      if (entry.principal === 'TENANT_OPERATOR') {
        expect(catalog.has(entry.capability as AccessCapability)).toBe(true);
      }
    }
  });

  it('stays aligned with the runtime entitlement policy or records a blocking gap', () => {
    for (const entry of PILOT_HTTP_SURFACE_MANIFEST) {
      const access = resolveTenantExecutionHttpAccess({
        method: entry.method,
        path: entry.path,
      });
      if (entry.principal === 'GUEST_SESSION') {
        expect(access).toBeNull();
        expect(entry.decision).toBe('BLOCKED');
        expect(entry.gaps).toContain(
          'PUBLIC_TENANT_ENTITLEMENT_ROUTE_UNCLASSIFIED',
        );
        continue;
      }
      if (entry.principal === 'SERVICE_TOKEN') {
        expect(entry.decision).toBe('BLOCKED');
        continue;
      }
      if (!access) {
        expect(entry.decision).toBe('BLOCKED');
        expect(entry.gaps).toContain('HTTP_ENTITLEMENT_ROUTE_UNCLASSIFIED');
        continue;
      }

      expect(access.module).toBe(entry.module);
      const expectedAction =
        entry.effect === 'READ'
          ? 'READ'
          : entry.effect === 'OUTBOUND'
            ? 'OUTBOUND'
            : 'WRITE';
      if (access.action !== expectedAction) {
        expect(entry.decision).toBe('BLOCKED');
        expect(entry.gaps).toContain('RUNTIME_OUTBOUND_CLASSIFICATION_MISSING');
      }
    }
  });

  it('stays aligned with RolesGuard capability resolution for operator routes', () => {
    const reflector = {
      getAllAndOverride: () => [UserRole.OWNER],
      get: () => undefined,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    for (const entry of PILOT_HTTP_SURFACE_MANIFEST) {
      if (entry.principal !== 'TENANT_OPERATOR') {
        continue;
      }
      const capability = entry.capability as AccessCapability;
      expect(
        guard.canActivate(
          executionContext(
            entry.method,
            entry.path,
            operatorUser([capability]),
          ),
        ),
      ).toBe(true);
      expect(() =>
        guard.canActivate(
          executionContext(entry.method, entry.path, operatorUser([])),
        ),
      ).toThrow(ForbiddenException);
    }
  });
});

import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import type { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PILOT_HTTP_SURFACE_MANIFEST } from '../tenancy/pilot-http-surface-manifest';
import { EmployeeInviteCurrent189CandidateController } from './employee-invite-current189-candidate.controller';
import {
  EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST,
  EmployeeInviteCurrent189DormantRouteApplication,
  type EmployeeInviteCurrent189SafeResponse,
} from './employee-invite-current189-route-policy';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const INVITE_ID = '33333333-3333-4333-8333-333333333333';
const REPLACEMENT_ID = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = '55555555-5555-4555-8555-555555555555';
const EXPIRES_AT = '2026-08-20T12:00:00.000Z';

const actor: AuthenticatedUser = {
  id: ACTOR_ID,
  email: 'masked-owner@identity.invalid',
  fullName: null,
  role: UserRole.OWNER,
  permissions: ['manage_users'],
  isActive: true,
  isPlatformAdmin: false,
  tenantId: TENANT_ID,
  tenantSlug: 'tenant-a',
  accessScope: 'NETWORK',
  allowedStoreIds: [],
};

const issueBody = Object.freeze({
  requestId: REQUEST_ID,
  email: 'candidate-address@identity.invalid',
  fullName: null,
  role: UserRole.CLUB_ADMINISTRATOR,
  customRoleId: null,
  scope: 'STORES',
  storeIds: [INVITE_ID],
  expiresAt: EXPIRES_AT,
});

const revokeBody = Object.freeze({
  requestId: REQUEST_ID,
  reason: 'owner-requested-revocation',
});

const responseFor = (
  operation: EmployeeInviteCurrent189SafeResponse['operation'],
): EmployeeInviteCurrent189SafeResponse => ({
  ok: true,
  routeContract: 'EMPLOYEE_INVITE_CURRENT189_ROUTE_V1',
  operation,
  decision:
    operation === 'ISSUE_EMPLOYEE_INVITE'
      ? 'CREATED'
      : operation === 'REISSUE_EMPLOYEE_INVITE'
        ? 'REISSUED'
        : 'REVOKED',
  replayed: false,
  invite: {
    id: operation === 'REISSUE_EMPLOYEE_INVITE' ? REPLACEMENT_ID : INVITE_ID,
    deliveryStatus:
      operation === 'REVOKE_EMPLOYEE_INVITE' ? 'CANCELED' : 'PENDING',
    expiresAt: operation === 'REVOKE_EMPLOYEE_INVITE' ? null : EXPIRES_AT,
  },
  replacedInviteId: operation === 'REISSUE_EMPLOYEE_INVITE' ? INVITE_ID : null,
});

describe('EmployeeInviteCurrent189CandidateController', () => {
  let testingModule: TestingModule;
  let controller: EmployeeInviteCurrent189CandidateController;
  let dispatch: jest.MockedFunction<
    EmployeeInviteCurrent189DormantRouteApplication['dispatch']
  >;
  let setHeader: jest.Mock;
  let response: Response;

  beforeEach(async () => {
    dispatch = jest
      .fn<EmployeeInviteCurrent189DormantRouteApplication['dispatch']>()
      .mockImplementation(
        (
          input: Parameters<
            EmployeeInviteCurrent189DormantRouteApplication['dispatch']
          >[0],
        ) => {
          if (input.handler === 'createInvite') {
            return Promise.resolve(responseFor('ISSUE_EMPLOYEE_INVITE'));
          }
          if (input.handler === 'updateInvite') {
            return Promise.resolve(responseFor('REISSUE_EMPLOYEE_INVITE'));
          }
          return Promise.resolve(responseFor('REVOKE_EMPLOYEE_INVITE'));
        },
      );
    testingModule = await Test.createTestingModule({
      controllers: [EmployeeInviteCurrent189CandidateController],
      providers: [
        {
          provide: EmployeeInviteCurrent189DormantRouteApplication,
          useValue: { dispatch },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = testingModule.get(EmployeeInviteCurrent189CandidateController);
    setHeader = jest.fn();
    response = { setHeader } as unknown as Response;
  });

  afterEach(async () => {
    await testingModule.close();
  });

  it('resolves through isolated Nest DI without production registration', () => {
    expect(controller).toBeInstanceOf(
      EmployeeInviteCurrent189CandidateController,
    );
  });

  it('binds the exact POST transport to the dormant issue application', async () => {
    const result = await controller.createInvite(
      actor,
      'application/json',
      undefined,
      REQUEST_ID,
      issueBody,
      response,
    );

    expect(dispatch).toHaveBeenCalledWith({
      handler: 'createInvite',
      method: 'POST',
      path: '/users/invites',
      actor,
      body: issueBody,
    });
    expect(result).toEqual(responseFor('ISSUE_EMPLOYEE_INVITE'));
    expectPrivateHeaders(setHeader);
  });

  it('binds exact PATCH and DELETE transports to immutable reissue and revoke', async () => {
    await controller.updateInvite(
      actor,
      INVITE_ID,
      'application/json',
      undefined,
      REQUEST_ID,
      issueBody,
      response,
    );
    await controller.cancelInvite(
      actor,
      INVITE_ID,
      'application/json',
      undefined,
      REQUEST_ID,
      revokeBody,
      response,
    );

    expect(dispatch.mock.calls).toEqual([
      [
        {
          handler: 'updateInvite',
          method: 'PATCH',
          path: '/users/invites/:id',
          actor,
          inviteId: INVITE_ID,
          body: issueBody,
        },
      ],
      [
        {
          handler: 'cancelInvite',
          method: 'DELETE',
          path: '/users/invites/:id',
          actor,
          inviteId: INVITE_ID,
          body: revokeBody,
        },
      ],
    ]);
  });

  it.each<
    [string, () => Promise<EmployeeInviteCurrent189SafeResponse>, string]
  >([
    [
      'missing JSON media type',
      () =>
        controller.createInvite(
          actor,
          undefined,
          undefined,
          REQUEST_ID,
          issueBody,
          response,
        ),
      'EMPLOYEE_INVITE_CURRENT189_MEDIA_TYPE_INVALID',
    ],
    [
      'media type parameters',
      () =>
        controller.createInvite(
          actor,
          'application/json; charset=utf-8',
          undefined,
          REQUEST_ID,
          issueBody,
          response,
        ),
      'EMPLOYEE_INVITE_CURRENT189_MEDIA_TYPE_INVALID',
    ],
    [
      'non-canonical content length',
      () =>
        controller.createInvite(
          actor,
          'application/json',
          '08192',
          REQUEST_ID,
          issueBody,
          response,
        ),
      'EMPLOYEE_INVITE_CURRENT189_BODY_TOO_LARGE',
    ],
    [
      'content length mismatch',
      () =>
        controller.createInvite(
          actor,
          'application/json',
          '1',
          REQUEST_ID,
          issueBody,
          response,
        ),
      'EMPLOYEE_INVITE_CURRENT189_CONTENT_LENGTH_MISMATCH',
    ],
    [
      'extra body field',
      () =>
        controller.createInvite(
          actor,
          'application/json',
          undefined,
          REQUEST_ID,
          { ...issueBody, rawToken: 'must-not-cross-boundary' },
          response,
        ),
      'EMPLOYEE_INVITE_CURRENT189_BODY_SHAPE_INVALID',
    ],
    [
      'idempotency mismatch',
      () =>
        controller.createInvite(
          actor,
          'application/json',
          undefined,
          INVITE_ID,
          issueBody,
          response,
        ),
      'EMPLOYEE_INVITE_CURRENT189_IDEMPOTENCY_BINDING_INVALID',
    ],
    [
      'malformed route invite id',
      () =>
        controller.updateInvite(
          actor,
          'not-an-id',
          'application/json',
          undefined,
          REQUEST_ID,
          issueBody,
          response,
        ),
      'EMPLOYEE_INVITE_CURRENT189_INVITE_ID_INVALID',
    ],
  ])(
    'fails closed for %s before application dispatch',
    async (_label, invoke, reasonCode) => {
      let error: unknown;
      try {
        await invoke();
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).toMatchObject({ response: { reasonCode } });
      expect(dispatch).not.toHaveBeenCalled();
      expectPrivateHeaders(setHeader);
      expect(JSON.stringify(error)).not.toMatch(
        /must-not-cross-boundary|identity\.invalid|rawToken/iu,
      );
    },
  );

  it('rejects the serialized body when it exceeds the independent byte bound', () => {
    const body = {
      ...revokeBody,
      reason: 'x'.repeat(8 * 1024),
    };

    let error: unknown;
    try {
      void controller.cancelInvite(
        actor,
        INVITE_ID,
        'application/json',
        undefined,
        REQUEST_ID,
        body,
        response,
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      response: {
        message: 'Employee invite request is invalid',
        reasonCode: 'EMPLOYEE_INVITE_CURRENT189_BODY_TOO_LARGE',
      },
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('CURRENT189 candidate controller AST and production isolation', () => {
  const sourceRoot = resolve(process.cwd(), 'src');
  const candidateFile =
    'users/employee-invite-current189-candidate.controller.ts';

  it('declares exactly the three candidate methods and paths', () => {
    expect(
      controllerRoutes(
        join(sourceRoot, candidateFile),
        'EmployeeInviteCurrent189CandidateController',
      ),
    ).toEqual([
      {
        handler: 'createInvite',
        method: 'POST',
        path: '/users/invites',
      },
      {
        handler: 'updateInvite',
        method: 'PATCH',
        path: '/users/invites/:id',
      },
      {
        handler: 'cancelInvite',
        method: 'DELETE',
        path: '/users/invites/:id',
      },
    ]);

    const source = readFileSync(join(sourceRoot, candidateFile), 'utf8');
    expect(source).toContain('@UseGuards(JwtAuthGuard, RolesGuard)');
    expect(source).toContain('@Roles(UserRole.OWNER)');
    expect(source).toContain("@Headers('idempotency-key')");
    expect(source).toContain("@Headers('content-type')");
    expect(source).toContain("@Headers('content-length')");
    expect(source).toContain('@CurrentUser()');
    expect(source).not.toContain('registrationUrl');
    expect(source).not.toContain('rawToken');
    expect(source).not.toContain('secretCiphertext');
  });

  it('is absent from every production Nest module', () => {
    const references = moduleFiles(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return source.includes('EmployeeInviteCurrent189CandidateController') ||
        source.includes('employee-invite-current189-candidate.controller')
        ? [file]
        : [];
    });

    expect(references).toEqual([]);
    const usersModule = readFileSync(
      join(sourceRoot, 'users/users.module.ts'),
      'utf8',
    );
    expect(usersModule).toContain('controllers: [UsersController]');
    expect(usersModule).not.toContain('CURRENT189');
  });

  it('leaves legacy handlers active and all matching Gate 1MT rows blocked', () => {
    const legacy = readFileSync(
      join(sourceRoot, 'users/users.controller.ts'),
      'utf8',
    );
    expect(legacy).toContain('this.usersService.createInvite(user, dto)');
    expect(legacy).toContain('this.usersService.updateInvite(user, id, dto)');
    expect(legacy).toContain('this.usersService.cancelInvite(user, id)');

    for (const candidate of EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST) {
      const row = PILOT_HTTP_SURFACE_MANIFEST.find(
        (entry) =>
          entry.method === candidate.method && entry.path === candidate.path,
      );
      expect(row).toMatchObject({
        module: 'USERS_ROLES',
        capability: 'manage_users',
        minimumScope: 'NETWORK',
        decision: 'BLOCKED',
      });
    }
  });

  it('forbids module registration while the three legacy route decorators overlap', () => {
    const candidateRoutes = controllerRoutes(
      join(sourceRoot, candidateFile),
      'EmployeeInviteCurrent189CandidateController',
    ).map(({ method, path }) => `${method} ${path}`);
    const legacyRoutes = controllerRoutes(
      join(sourceRoot, 'users/users.controller.ts'),
      'UsersController',
    )
      .map(({ method, path }) => `${method} ${path}`)
      .filter((route) => candidateRoutes.includes(route));

    expect(legacyRoutes.sort()).toEqual([...candidateRoutes].sort());
    expect(
      moduleFiles(sourceRoot).some((file) => {
        const source = readFileSync(file, 'utf8');
        return (
          source.includes('EmployeeInviteCurrent189CandidateController') ||
          source.includes('employee-invite-current189-candidate.controller')
        );
      }),
    ).toBe(false);
  });
});

type AstRoute = Readonly<{
  handler: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
}>;

function expectPrivateHeaders(setHeader: jest.Mock): void {
  expect(setHeader).toHaveBeenCalledWith(
    'Cache-Control',
    'private, no-store, max-age=0',
  );
  expect(setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
  expect(setHeader).toHaveBeenCalledWith(
    'Vary',
    'Authorization, Cookie, Idempotency-Key',
  );
  expect(setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
  expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  expect(setHeader).toHaveBeenCalledWith(
    'Cross-Origin-Resource-Policy',
    'same-origin',
  );
}

function moduleFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return moduleFiles(path);
    return entry.isFile() && entry.name.endsWith('.module.ts') ? [path] : [];
  });
}

function controllerRoutes(file: string, className: string): AstRoute[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const controller = source.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === className,
  );
  if (!controller) throw new Error(`${className} is absent`);
  const prefix = decoratorsOf(controller)
    .map((decorator) => decoratorString(decorator, 'Controller'))
    .find((value) => value !== null);
  if (prefix === undefined) throw new Error('@Controller is absent');

  return controller.members.flatMap((member): AstRoute[] => {
    if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) {
      return [];
    }
    for (const decorator of decoratorsOf(member)) {
      for (const [name, method] of [
        ['Post', 'POST'],
        ['Patch', 'PATCH'],
        ['Delete', 'DELETE'],
      ] as const) {
        const localPath = decoratorString(decorator, name);
        if (localPath !== null) {
          return [
            {
              handler: member.name.text,
              method,
              path: `/${[prefix, localPath].filter(Boolean).join('/')}`,
            },
          ];
        }
      }
    }
    return [];
  });
}

function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorString(
  decorator: ts.Decorator,
  expectedName: string,
): string | null {
  if (!ts.isCallExpression(decorator.expression)) return null;
  const expression = decorator.expression.expression;
  if (!ts.isIdentifier(expression) || expression.text !== expectedName) {
    return null;
  }
  const argument = decorator.expression.arguments[0];
  return argument && ts.isStringLiteral(argument) ? argument.text : '';
}

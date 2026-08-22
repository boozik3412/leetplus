import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import {
  GuestPortalCurrent190ApplicationBoundary,
  type GuestPortalCurrent190ApplicationSessionPort,
  type GuestPortalCurrent190TenantMediaPort,
} from './guest-portal-current190-application-boundary';
import { GuestPortalCurrent190CandidateController } from './guest-portal-current190-candidate.controller';
import { GUEST_PORTAL_CURRENT190_APPLICATION_BLOCKERS } from './guest-portal-current190-route-policy';

type AstRoute = Readonly<{
  handler: string;
  method: 'GET' | 'POST';
  path: string;
}>;

const sourceRoot = resolve(process.cwd(), 'src');
const candidateSource =
  'guest-portal/guest-portal-current190-candidate.controller.ts';

describe('GuestPortalCurrent190CandidateController', () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const tenantId = '22222222-2222-4222-8222-222222222222';
  const assetId = '33333333-3333-4333-8333-333333333333';
  const requestId = 'logout-request-0001';
  const revokedAt = new Date('2026-08-05T12:00:00.000Z');
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  let testingModule: TestingModule;
  let controller: GuestPortalCurrent190CandidateController;
  let session: jest.Mocked<GuestPortalCurrent190ApplicationSessionPort>;
  let media: jest.Mocked<GuestPortalCurrent190TenantMediaPort>;
  let setHeader: jest.Mock;
  let response: Response;

  beforeEach(async () => {
    session = {
      revoke: jest.fn().mockResolvedValue({
        sessionId,
        status: 'REVOKED',
        revokedAt,
        replayed: false,
      }),
      authorizeMedia: jest.fn().mockResolvedValue({
        assetId,
        tenantId,
        contentType: 'image/png',
        byteSize: bytes.length,
      }),
    };
    media = {
      readForTenant: jest.fn().mockResolvedValue({
        assetId,
        tenantId,
        contentType: 'image/png',
        buffer: bytes,
      }),
    };
    const application = new GuestPortalCurrent190ApplicationBoundary(
      session,
      media,
    );
    testingModule = await Test.createTestingModule({
      controllers: [GuestPortalCurrent190CandidateController],
      providers: [
        {
          provide: GuestPortalCurrent190ApplicationBoundary,
          useValue: application,
        },
      ],
    }).compile();
    controller = testingModule.get(GuestPortalCurrent190CandidateController);
    setHeader = jest.fn();
    response = { setHeader } as unknown as Response;
  });

  afterEach(async () => {
    await testingModule.close();
  });

  it('resolves through isolated Nest DI without production module registration', () => {
    expect(controller).toBeInstanceOf(GuestPortalCurrent190CandidateController);
  });

  it('passes the exact client idempotency key through repeated logout calls', async () => {
    session.revoke
      .mockResolvedValueOnce({
        sessionId,
        status: 'REVOKED',
        revokedAt,
        replayed: false,
      })
      .mockResolvedValueOnce({
        sessionId,
        status: 'REVOKED',
        revokedAt,
        replayed: true,
      });

    const first = await controller.logout(
      'Bearer persisted-guest-token',
      requestId,
      response,
    );
    const replay = await controller.logout(
      'Bearer persisted-guest-token',
      requestId,
      response,
    );

    expect(session.revoke.mock.calls).toEqual([
      ['Bearer persisted-guest-token', requestId],
      ['Bearer persisted-guest-token', requestId],
    ]);
    expect(first).toEqual({
      ok: true,
      status: 'REVOKED',
      replayed: false,
      revokedAt: revokedAt.toISOString(),
    });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(JSON.stringify([first, replay])).not.toContain(sessionId);
    expect(JSON.stringify([first, replay])).not.toContain(
      'persisted-guest-token',
    );
    expectPrivateHeaders(setHeader);
  });

  it('does not invent an idempotency key when the header is missing', async () => {
    await expect(
      controller.logout('Bearer persisted-guest-token', undefined, response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(session.revoke.mock.calls).toHaveLength(0);
  });

  it('streams only bearer-admitted tenant bytes with private no-store headers', async () => {
    const file = await controller.readMedia(
      'Bearer persisted-guest-token',
      assetId,
      response,
    );

    expect(session.authorizeMedia.mock.calls).toEqual([
      ['Bearer persisted-guest-token', assetId],
    ]);
    expect(media.readForTenant.mock.calls).toEqual([[tenantId, assetId]]);
    expect(file.getHeaders()).toEqual({
      type: 'image/png',
      disposition: 'inline',
      length: bytes.length,
    });
    expectPrivateHeaders(setHeader);
  });
});

describe('CURRENT190 candidate controller AST isolation', () => {
  it('declares only the exact dormant logout and protected media routes', () => {
    expect(
      controllerRoutes(
        candidateSource,
        'GuestPortalCurrent190CandidateController',
      ),
    ).toEqual([
      {
        handler: 'logout',
        method: 'POST',
        path: '/guest-portal/session/logout',
      },
      {
        handler: 'readMedia',
        method: 'GET',
        path: '/guest-portal/session/media/:id',
      },
    ]);

    const source = readFileSync(join(sourceRoot, candidateSource), 'utf8');
    expect(source).toContain("@Headers('authorization')");
    expect(source).toContain("@Headers('idempotency-key')");
    expect(source).toContain('@HttpCode(HttpStatus.OK)');
    expect(source).not.toContain('getAsset(');
    expect(source).not.toContain('/public/guest-game/media');
  });

  it('is absent from every production Nest module import and registration', () => {
    const references = moduleFiles(sourceRoot).flatMap((file) => {
      const source = parse(file);
      const found: string[] = [];
      const visit = (node: ts.Node): void => {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text.includes(
            'guest-portal-current190-candidate.controller',
          )
        ) {
          found.push(`${file}:import`);
        }
        if (
          ts.isIdentifier(node) &&
          node.text === 'GuestPortalCurrent190CandidateController'
        ) {
          found.push(`${file}:identifier`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      return found;
    });

    expect(references).toEqual([]);
  });

  it('keeps the legacy public ID-only route explicitly BLOCKED for cutover', () => {
    const legacyRoutes = controllerRoutes(
      'guest-gamification/guest-game-media.controller.ts',
      'GuestGamePublicMediaController',
    );
    expect(legacyRoutes).toContainEqual({
      handler: 'read',
      method: 'GET',
      path: '/public/guest-game/media/:id',
    });
    expect(GUEST_PORTAL_CURRENT190_APPLICATION_BLOCKERS).toContainEqual(
      expect.objectContaining({
        id: 'LEGACY_PUBLIC_MEDIA_ID_ONLY',
        path: '/public/guest-game/media/:id',
        currentState: 'LEGACY_PUBLIC_ID_ONLY',
        requiredBinding: 'PROTECTED_MEDIA_CUTOVER',
        decision: 'BLOCKED',
      }),
    );

    const legacySource = readFileSync(
      join(sourceRoot, 'guest-gamification/guest-game-media.controller.ts'),
      'utf8',
    );
    expect(legacySource).toContain(
      "@Header('Cache-Control', 'public, max-age=31536000, immutable')",
    );
    expect(legacySource).not.toContain("@Headers('authorization')");
    expect(legacySource).not.toContain('authorizeMedia');
  });
});

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

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
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

function controllerRoutes(relative: string, className: string): AstRoute[] {
  const file = join(sourceRoot, relative);
  const source = parse(file);
  const controller = source.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === className,
  );
  if (!controller) throw new Error(`Controller ${className} is missing`);
  const prefix = decoratorsOf(controller)
    .map((decorator) => decoratorString(decorator, 'Controller'))
    .find((value) => value !== null);
  if (prefix === undefined)
    throw new Error(`@Controller missing: ${className}`);

  return controller.members.flatMap((member): AstRoute[] => {
    if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) {
      return [];
    }
    for (const decorator of decoratorsOf(member)) {
      for (const method of ['GET', 'POST'] as const) {
        const localPath = decoratorString(
          decorator,
          method === 'GET' ? 'Get' : 'Post',
        );
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

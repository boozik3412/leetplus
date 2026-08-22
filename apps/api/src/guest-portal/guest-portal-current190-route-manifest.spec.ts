import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import {
  GUEST_PORTAL_CURRENT190_APPLICATION_BLOCKERS,
  GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST,
} from './guest-portal-current190-route-policy';

type AstRoute = {
  handler: string;
  method: 'GET' | 'POST';
  path: string;
};

const sourcePath = (relative: string) => resolve(process.cwd(), relative);

const decoratorsOf = (node: ts.Node): readonly ts.Decorator[] =>
  ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];

const stringArgument = (
  decorator: ts.Decorator,
  expectedName: string,
): string | null => {
  if (!ts.isCallExpression(decorator.expression)) {
    return null;
  }
  const expression = decorator.expression.expression;
  if (!ts.isIdentifier(expression) || expression.text !== expectedName) {
    return null;
  }
  const argument = decorator.expression.arguments[0];
  return argument && ts.isStringLiteral(argument) ? argument.text : '';
};

const controllerRoutes = (relative: string, className: string): AstRoute[] => {
  const file = sourcePath(relative);
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const controller = source.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === className,
  );
  if (!controller) {
    throw new Error(`Controller ${className} not found in ${relative}`);
  }
  const prefix = decoratorsOf(controller)
    .map((decorator) => stringArgument(decorator, 'Controller'))
    .find((value) => value !== null);
  if (prefix === undefined) {
    throw new Error(`@Controller prefix missing for ${className}`);
  }

  return controller.members.flatMap((member): AstRoute[] => {
    if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) {
      return [];
    }
    for (const decorator of decoratorsOf(member)) {
      for (const method of ['GET', 'POST'] as const) {
        const localPath = stringArgument(
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
};

const sorted = <T extends AstRoute>(routes: readonly T[]): T[] =>
  [...routes].sort((left, right) =>
    `${left.method} ${left.path} ${left.handler}`.localeCompare(
      `${right.method} ${right.path} ${right.handler}`,
    ),
  );

describe('CURRENT190 GuestPortalController AST manifest', () => {
  it('inventories every current controller method exactly once', () => {
    const astRoutes = controllerRoutes(
      'src/guest-portal/guest-portal.controller.ts',
      'GuestPortalController',
    );
    const manifestRoutes = GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST.map(
      ({ handler, method, path }) => ({ handler, method, path }),
    );

    expect(astRoutes).toHaveLength(31);
    expect(new Set(astRoutes.map((entry) => entry.handler)).size).toBe(31);
    expect(new Set(manifestRoutes.map((entry) => entry.handler)).size).toBe(31);
    expect(sorted(manifestRoutes)).toEqual(sorted(astRoutes));
  });

  it('has one exact class and binding for every manifest entry', () => {
    expect(
      GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST.reduce<Record<string, number>>(
        (counts, entry) => {
          counts[entry.classification] =
            (counts[entry.classification] ?? 0) + 1;
          return counts;
        },
        {},
      ),
    ).toEqual({
      PUBLIC_BOOTSTRAP: 9,
      OUTBOUND: 9,
      READ: 3,
      WRITE: 10,
    });

    for (const entry of GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST) {
      expect(entry.path.startsWith('/guest-portal/')).toBe(true);
      expect(entry.requiredBinding).toBeTruthy();
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  it('proves the policy remains absent from the production controller and module', () => {
    const controller = readFileSync(
      sourcePath('src/guest-portal/guest-portal.controller.ts'),
      'utf8',
    );
    const module = readFileSync(
      sourcePath('src/guest-portal/guest-portal.module.ts'),
      'utf8',
    );

    expect(controller).not.toContain('current190-route-policy');
    expect(controller).not.toContain('GuestPortalSessionCurrent190');
    expect(module).not.toContain('current190-route-policy');
    expect(module).not.toContain('GuestPortalSessionCurrent190');
  });

  it('keeps persisted logout blocked while its candidate controller is unregistered', () => {
    const routes = controllerRoutes(
      'src/guest-portal/guest-portal.controller.ts',
      'GuestPortalController',
    );
    const blocker = GUEST_PORTAL_CURRENT190_APPLICATION_BLOCKERS.find(
      (entry) => entry.id === 'LOGOUT_PERSISTED_REVOKE',
    );

    expect(blocker).toMatchObject({
      method: 'POST',
      path: '/guest-portal/session/logout',
      currentState: 'DORMANT_CONTROLLER_UNREGISTERED',
      requiredBinding: 'PERSISTED_REVOKE',
      decision: 'BLOCKED',
    });
    expect(routes).not.toContainEqual(
      expect.objectContaining({ method: blocker!.method, path: blocker!.path }),
    );
  });

  it('keeps legacy public media blocked until bearer tenant admission replaces it', () => {
    const routes = controllerRoutes(
      'src/guest-gamification/guest-game-media.controller.ts',
      'GuestGamePublicMediaController',
    );
    const blocker = GUEST_PORTAL_CURRENT190_APPLICATION_BLOCKERS.find(
      (entry) => entry.id === 'LEGACY_PUBLIC_MEDIA_ID_ONLY',
    );
    const source = readFileSync(
      sourcePath('src/guest-gamification/guest-game-media.controller.ts'),
      'utf8',
    );

    expect(blocker).toMatchObject({
      method: 'GET',
      path: '/public/guest-game/media/:id',
      currentState: 'LEGACY_PUBLIC_ID_ONLY',
      requiredBinding: 'PROTECTED_MEDIA_CUTOVER',
      decision: 'BLOCKED',
    });
    expect(routes).toContainEqual({
      handler: 'read',
      method: blocker!.method,
      path: blocker!.path,
    });
    expect(source).toContain(
      "@Header('Cache-Control', 'public, max-age=31536000, immutable')",
    );
    expect(source).not.toContain("@Headers('authorization')");
    expect(source).not.toContain('authorizeMedia');
  });
});

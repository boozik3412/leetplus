import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { PILOT_HTTP_SURFACE_MANIFEST } from '../tenancy/pilot-http-surface-manifest';
import { EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST } from './employee-invite-current189-route-policy';

type AstRoute = Readonly<{
  handler: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
}>;

const sourcePath = (relative: string) => resolve(process.cwd(), relative);

const decoratorsOf = (node: ts.Node): readonly ts.Decorator[] =>
  ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];

const stringArgument = (
  decorator: ts.Decorator,
  expectedName: string,
): string | null => {
  if (!ts.isCallExpression(decorator.expression)) return null;
  const expression = decorator.expression.expression;
  if (!ts.isIdentifier(expression) || expression.text !== expectedName) {
    return null;
  }
  const argument = decorator.expression.arguments[0];
  return argument && ts.isStringLiteral(argument) ? argument.text : '';
};

const controllerDeclaration = (
  relative: string,
  className: string,
): ts.ClassDeclaration => {
  const file = sourcePath(relative);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = source.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === className,
  );
  if (!declaration) throw new Error(`${className} is absent from ${relative}`);
  return declaration;
};

const controllerRoutes = (
  relative: string,
  className: string,
): readonly AstRoute[] => {
  const controller = controllerDeclaration(relative, className);
  const prefix = decoratorsOf(controller)
    .map((decorator) => stringArgument(decorator, 'Controller'))
    .find((value) => value !== null);
  if (prefix === undefined) throw new Error('Controller prefix is absent');

  return controller.members.flatMap((member): AstRoute[] => {
    if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) {
      return [];
    }
    for (const decorator of decoratorsOf(member)) {
      for (const method of ['POST', 'PATCH', 'DELETE'] as const) {
        const localPath = stringArgument(
          decorator,
          method[0] + method.slice(1).toLowerCase(),
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

const methodText = (
  relative: string,
  className: string,
  methodName: string,
): string => {
  const controller = controllerDeclaration(relative, className);
  const method = controller.members.find(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === methodName,
  );
  if (!method) throw new Error(`${methodName} is absent from ${className}`);
  return method.getText();
};

const sorted = <T extends AstRoute>(routes: readonly T[]): T[] =>
  [...routes].sort((left, right) =>
    `${left.method} ${left.path} ${left.handler}`.localeCompare(
      `${right.method} ${right.path} ${right.handler}`,
    ),
  );

describe('CURRENT189 UsersController dormant invite route manifest', () => {
  const controllerFile = 'src/users/users.controller.ts';
  const moduleFile = 'src/users/users.module.ts';

  it('binds exactly the three existing invite handlers and no other users route', () => {
    const controller = controllerRoutes(controllerFile, 'UsersController');
    const actualInviteRoutes = controller.filter((entry) =>
      ['createInvite', 'updateInvite', 'cancelInvite'].includes(entry.handler),
    );
    const manifestRoutes = EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST.map(
      ({ handler, method, path }) => ({ handler, method, path }),
    );

    expect(actualInviteRoutes).toHaveLength(3);
    expect(sorted(manifestRoutes)).toEqual(sorted(actualInviteRoutes));
    expect(new Set(manifestRoutes.map(({ handler }) => handler)).size).toBe(3);
    expect(
      EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST.map(
        ({ coordinatorMethod }) => coordinatorMethod,
      ).sort(),
    ).toEqual(['issue', 'reissue', 'revoke']);
  });

  it('proves production handlers still delegate to legacy UsersService', () => {
    expect(methodText(controllerFile, 'UsersController', 'createInvite')).toContain(
      'this.usersService.createInvite(user, dto)',
    );
    expect(methodText(controllerFile, 'UsersController', 'updateInvite')).toContain(
      'this.usersService.updateInvite(user, id, dto)',
    );
    expect(methodText(controllerFile, 'UsersController', 'cancelInvite')).toContain(
      'this.usersService.cancelInvite(user, id)',
    );
  });

  it('proves route policy and coordinator remain absent from production controller/module wiring', () => {
    const controller = readFileSync(sourcePath(controllerFile), 'utf8');
    const module = readFileSync(sourcePath(moduleFile), 'utf8');

    for (const source of [controller, module]) {
      expect(source).not.toContain('employee-invite-current189-route-policy');
      expect(source).not.toContain('EmployeeInviteCurrent189DormantRouteApplication');
      expect(source).not.toContain('EmployeeInviteDeliveryCoordinator');
    }
    expect(module).toContain('providers: [UsersService]');
    expect(module).not.toContain('CURRENT189');
  });

  it('keeps all three production routes BLOCKED in the Gate 1MT inventory', () => {
    const rows = EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST.map((route) =>
      PILOT_HTTP_SURFACE_MANIFEST.find(
        (entry) =>
          entry.method === route.method && entry.path === route.path,
      ),
    );

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({
        module: 'USERS_ROLES',
        capability: 'manage_users',
        minimumScope: 'NETWORK',
        decision: 'BLOCKED',
      });
      expect(row?.gaps).toEqual(
        expect.arrayContaining(['NETWORK_SCOPE_NOT_ASSERTED']),
      );
    }
  });

  it('keeps legacy direct POST /users outside the candidate manifest and blocked', () => {
    const directCreate = controllerRoutes(
      controllerFile,
      'UsersController',
    ).find((entry) => entry.handler === 'createUser');
    const pilotRow = PILOT_HTTP_SURFACE_MANIFEST.find(
      (entry) => entry.id === 'POST /users',
    );

    expect(directCreate).toEqual({
      handler: 'createUser',
      method: 'POST',
      path: '/users',
    });
    expect(EMPLOYEE_INVITE_CURRENT189_ROUTE_MANIFEST).not.toContainEqual(
      expect.objectContaining({ path: '/users' }),
    );
    expect(pilotRow).toMatchObject({
      decision: 'BLOCKED',
      capability: 'manage_users',
    });
    expect(pilotRow?.gaps).toEqual(
      expect.arrayContaining(['ROUTE_INTENTIONALLY_DISABLED']),
    );
  });
});

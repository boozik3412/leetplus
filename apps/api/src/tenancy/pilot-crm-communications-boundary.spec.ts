import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

type MethodBoundary = Readonly<{
  methodName: string;
  routeId: string;
}>;

const SOURCE_ROOT = resolve(__dirname, '..');
const HTTP_METHODS = new Map([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Patch', 'PATCH'],
]);

const CRM_COMMUNICATIONS_BOUNDARIES: readonly MethodBoundary[] = [
  {
    methodName: 'getGuestCrmTasks',
    routeId: 'GET /guests/crm/tasks',
  },
  {
    methodName: 'getGuestCrmTaskReport',
    routeId: 'GET /guests/crm/tasks/report',
  },
  {
    methodName: 'exportGuestCrmTasks',
    routeId: 'GET /guests/crm/tasks/export',
  },
  {
    methodName: 'createGuestCrmTask',
    routeId: 'POST /guests/crm/tasks',
  },
  {
    methodName: 'getGuestCrmUsers',
    routeId: 'GET /guests/crm/users',
  },
  {
    methodName: 'getGuestCrmContactEvents',
    routeId: 'GET /guests/crm/contact-events',
  },
  {
    methodName: 'createGuestCrmContactEvent',
    routeId: 'POST /guests/crm/contact-events',
  },
  {
    methodName: 'updateGuestCrmTask',
    routeId: 'PATCH /guests/crm/tasks/:id',
  },
] as const;

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

function decorators(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorCall(
  node: ts.Node,
  name: string,
): ts.CallExpression | undefined {
  return decorators(node)
    .map((decorator) => decorator.expression)
    .filter(ts.isCallExpression)
    .find(
      (call) =>
        ts.isIdentifier(call.expression) && call.expression.text === name,
    );
}

function literalArgument(call: ts.CallExpression | undefined): string {
  const argument = call?.arguments[0];
  if (
    !argument ||
    (!ts.isStringLiteral(argument) &&
      !ts.isNoSubstitutionTemplateLiteral(argument))
  ) {
    return '';
  }
  return argument.text;
}

function classDeclaration(
  sourceFile: ts.SourceFile,
  name: string,
): ts.ClassDeclaration {
  const result = sourceFile.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === name,
  );
  if (!result) {
    throw new Error(`Missing class ${name}`);
  }
  return result;
}

function namedMethod(
  declaration: ts.ClassDeclaration,
  name: string,
): ts.MethodDeclaration {
  const result = declaration.members.find(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === name,
  );
  if (!result) {
    throw new Error(`Missing method ${name}`);
  }
  return result;
}

function guardNames(node: ts.Node): readonly string[] {
  return (
    decoratorCall(node, 'UseGuards')?.arguments.map((argument) =>
      ts.isIdentifier(argument) ? argument.text : argument.getText(),
    ) ?? []
  );
}

function routeIds(
  prefix: string,
  method: ts.MethodDeclaration,
): readonly string[] {
  const result: string[] = [];
  for (const [decorator, httpMethod] of HTTP_METHODS) {
    const call = decoratorCall(method, decorator);
    if (!call) {
      continue;
    }
    const suffix = literalArgument(call);
    result.push(`${httpMethod} /${[prefix, suffix].filter(Boolean).join('/')}`);
  }
  return result;
}

describe('Gate 1MT CRM communications boundary', () => {
  it('binds exactly eight contact-task routes to fresh NETWORK authority', () => {
    const source = parseSource('guests/guests.controller.ts');
    const controller = classDeclaration(source, 'GuestsController');
    const prefix = literalArgument(decoratorCall(controller, 'Controller'));

    for (const boundary of CRM_COMMUNICATIONS_BOUNDARIES) {
      const method = namedMethod(controller, boundary.methodName);
      expect(guardNames(method)).toEqual(['FreshNetworkScopeGuard']);
      expect(routeIds(prefix, method)).toEqual([boundary.routeId]);
    }

    expect(CRM_COMMUNICATIONS_BOUNDARIES).toHaveLength(8);
    expect(
      new Set(CRM_COMMUNICATIONS_BOUNDARIES.map(({ routeId }) => routeId)).size,
    ).toBe(8);
  });

  it('does not attach the NETWORK communications guard to broad CRM lead routes', () => {
    const source = parseSource('guests/guests.controller.ts');
    const controller = classDeclaration(source, 'GuestsController');

    for (const methodName of [
      'getGuestCrmLeads',
      'createGuestCrmLead',
      'updateGuestCrmLead',
    ]) {
      expect(guardNames(namedMethod(controller, methodName))).not.toContain(
        'FreshNetworkScopeGuard',
      );
    }
  });

  it('keeps the eight service paths free of provider/outbound effects', () => {
    const source = parseSource('guests/guests.service.ts');
    const service = classDeclaration(source, 'GuestsService');

    for (const { methodName } of CRM_COMMUNICATIONS_BOUNDARIES) {
      const body = namedMethod(service, methodName).body?.getText() ?? '';
      expect(body).not.toMatch(
        /\b(?:langameClient|guestDataFoundationService|fetch|axios|sendMail|sendSms|dispatch)\b/u,
      );
    }
  });
});

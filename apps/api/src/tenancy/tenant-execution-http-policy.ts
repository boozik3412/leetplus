import { TenantModule } from '@prisma/client';
import type { TenantExecutionAction } from './tenant-execution-policy.service';

export type TenantExecutionHttpRequest = {
  method?: string;
  path?: string;
  originalUrl?: string;
  url?: string;
};

export type TenantExecutionHttpAccess = {
  module: TenantModule;
  action: TenantExecutionAction;
  path: string;
};

export type TenantExecutionHttpRequirement = Omit<
  TenantExecutionHttpAccess,
  'path'
>;

export const TENANT_EXECUTION_HTTP_UNCLASSIFIED_REASON =
  'TENANT_MODULE_ROUTE_UNCLASSIFIED';

const EXEMPT_REQUESTS = new Map<string, ReadonlySet<string>>([
  ['/auth/me', new Set(['GET', 'HEAD'])],
]);

const MODULE_PREFIXES: ReadonlyArray<{
  prefix: string;
  module: TenantModule;
}> = [
  { prefix: '/guests/gamification', module: TenantModule.GAMIFICATION },
  { prefix: '/guest-game', module: TenantModule.GAMIFICATION },
  { prefix: '/guests/staff-control', module: TenantModule.STAFF },
  { prefix: '/staff/team-chat', module: TenantModule.COMMUNICATIONS },
  { prefix: '/staff/notifications', module: TenantModule.COMMUNICATIONS },
  { prefix: '/staff', module: TenantModule.STAFF },
  { prefix: '/users', module: TenantModule.USERS_ROLES },
  { prefix: '/integrations', module: TenantModule.INTEGRATIONS },
  { prefix: '/settings', module: TenantModule.INTEGRATIONS },
  { prefix: '/products', module: TenantModule.ASSORTMENT },
  { prefix: '/categories', module: TenantModule.ASSORTMENT },
  { prefix: '/suppliers', module: TenantModule.ASSORTMENT },
  { prefix: '/stores', module: TenantModule.ASSORTMENT },
  { prefix: '/reports', module: TenantModule.ASSORTMENT },
  { prefix: '/dashboard', module: TenantModule.ASSORTMENT },
  { prefix: '/imports', module: TenantModule.ASSORTMENT },
  { prefix: '/utilities', module: TenantModule.ASSORTMENT },
];

const EXACT_MODULE_REQUESTS: ReadonlyArray<{
  method: string;
  path: RegExp;
  module: TenantModule;
}> = [
  {
    method: 'GET',
    path: /^\/guests\/crm\/(?:tasks(?:\/(?:report|export))?|users|contact-events)$/,
    module: TenantModule.COMMUNICATIONS,
  },
  {
    method: 'POST',
    path: /^\/guests\/crm\/(?:tasks|contact-events)$/,
    module: TenantModule.COMMUNICATIONS,
  },
  {
    method: 'PATCH',
    path: /^\/guests\/crm\/tasks\/[^/]+$/,
    module: TenantModule.COMMUNICATIONS,
  },
];

const OUTBOUND_REQUESTS: readonly RegExp[] = [
  /^\/stores\/address-suggestions$/,
  /^\/stores\/address-geocode$/,
  /^\/stores\/yandex-maps-geocode$/,
  /^\/stores\/address-geocode\/missing$/,
  /^\/categories\/langame\/refresh$/,
  /^\/reports\/email$/,
  /^\/reports\/digests\/email$/,
  /^\/guests\/gamification\/deliveries\/dispatch$/,
  /^\/guests\/gamification\/bonus-ledger\/dispatch$/,
  /^\/guests\/gamification\/log\/profiles\/[^/]+\/(?:sync|relink)$/,
];

const READ_REQUESTS: ReadonlyArray<{
  method: string;
  path: RegExp;
}> = [
  {
    method: 'POST',
    path: /^\/integrations\/langame\/settings\/preview$/,
  },
  {
    method: 'POST',
    path: /^\/integrations\/langame\/onboarding\/preview$/,
  },
  {
    method: 'GET',
    path: /^\/integrations\/langame\/routes-diagnostics$/,
  },
  {
    method: 'GET',
    path: /^\/integrations\/langame\/service-diagnostics$/,
  },
  {
    method: 'POST',
    path: /^\/integrations\/langame\/guests\/search-diagnostics$/,
  },
];

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const CROSS_MODULE_REQUESTS: ReadonlyArray<{
  method: string;
  path: RegExp;
  modules: readonly TenantModule[];
}> = [
  {
    method: 'POST',
    path: /^\/integrations\/langame\/sync$/,
    modules: [TenantModule.INTEGRATIONS, TenantModule.ASSORTMENT],
  },
  {
    method: 'POST',
    path: /^\/integrations\/langame\/guests\/foundation\/sync(?:\/start)?$/,
    modules: [
      TenantModule.INTEGRATIONS,
      TenantModule.ASSORTMENT,
      TenantModule.GAMIFICATION,
      TenantModule.STAFF,
    ],
  },
  {
    method: 'GET',
    path: /^\/integrations\/langame\/business-snapshots\/status$/,
    modules: [
      TenantModule.INTEGRATIONS,
      TenantModule.ASSORTMENT,
      TenantModule.GAMIFICATION,
      TenantModule.STAFF,
    ],
  },
  {
    method: 'POST',
    path: /^\/integrations\/langame\/business-snapshots\/run$/,
    modules: [
      TenantModule.INTEGRATIONS,
      TenantModule.ASSORTMENT,
      TenantModule.GAMIFICATION,
      TenantModule.STAFF,
    ],
  },
];

export function resolveTenantExecutionHttpAccess(
  request: TenantExecutionHttpRequest,
): TenantExecutionHttpAccess | null {
  const path = normalizeRequestPath(request);
  const method = (request.method ?? 'GET').toUpperCase();
  const exactMatch = EXACT_MODULE_REQUESTS.find(
    (candidate) => candidate.method === method && candidate.path.test(path),
  );
  const prefixMatch = MODULE_PREFIXES.find(({ prefix }) =>
    matchesPrefix(path, prefix),
  );
  const module = exactMatch?.module ?? prefixMatch?.module;
  if (!module) {
    return null;
  }

  const action = resolveAction(path, method);
  return {
    module,
    action,
    path,
  };
}

export function resolveTenantExecutionHttpRequirements(
  request: TenantExecutionHttpRequest,
): readonly TenantExecutionHttpRequirement[] {
  const access = resolveTenantExecutionHttpAccess(request);
  if (!access) {
    return [];
  }

  const method = (request.method ?? 'GET').toUpperCase();
  const crossModuleRequest = CROSS_MODULE_REQUESTS.find(
    (candidate) =>
      candidate.method === method && candidate.path.test(access.path),
  );
  if (!crossModuleRequest) {
    return [{ module: access.module, action: access.action }];
  }

  return crossModuleRequest.modules.map((module) => ({
    module,
    action: access.action,
  }));
}

export function isTenantExecutionHttpExempt(
  request: TenantExecutionHttpRequest,
): boolean {
  const methods = EXEMPT_REQUESTS.get(normalizeRequestPath(request));
  return methods?.has((request.method ?? 'GET').toUpperCase()) ?? false;
}

function resolveAction(path: string, method: string): TenantExecutionAction {
  if (OUTBOUND_REQUESTS.some((pattern) => pattern.test(path))) {
    return 'OUTBOUND';
  }
  if (
    READ_REQUESTS.some(
      (request) => request.method === method && request.path.test(path),
    )
  ) {
    return 'READ';
  }
  return READ_METHODS.has(method) ? 'READ' : 'WRITE';
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function normalizeRequestPath(request: TenantExecutionHttpRequest): string {
  const rawPath = request.path ?? request.originalUrl ?? request.url ?? '/';
  const withoutQuery = rawPath.split('?', 1)[0] || '/';
  const withLeadingSlash = withoutQuery.startsWith('/')
    ? withoutQuery
    : `/${withoutQuery}`;
  const withoutApiPrefix =
    withLeadingSlash === '/api'
      ? '/'
      : withLeadingSlash.startsWith('/api/')
        ? withLeadingSlash.slice(4)
        : withLeadingSlash;
  if (withoutApiPrefix.length > 1 && withoutApiPrefix.endsWith('/')) {
    return withoutApiPrefix.slice(0, -1);
  }
  return withoutApiPrefix;
}

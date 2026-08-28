import type { AccessCapability } from '../auth/capabilities';

/**
 * Gate 1MT inventory for the first external tenant.
 *
 * This file is deliberately data-only. It is not a runtime allowlist and must
 * never be used to open a route. The companion source-inventory test proves
 * that every HTTP handler in the agreed pilot modules has an explicit row.
 */

export const PILOT_HTTP_MODULES = [
  'GAMIFICATION',
  'ASSORTMENT',
  'STAFF',
  'COMMUNICATIONS',
  'USERS_ROLES',
] as const;

export type PilotHttpModule = (typeof PILOT_HTTP_MODULES)[number];
export type PilotHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type PilotHttpEffect = 'READ' | 'TENANT_WRITE' | 'OUTBOUND';
export type PilotHttpScope = 'NETWORK' | 'STORES';
export type PilotHttpStoreFilter = 'NOT_APPLICABLE' | 'REQUIRED';
export type PilotHttpPrincipal =
  | 'TENANT_OPERATOR'
  | 'GUEST_SESSION'
  | 'SERVICE_TOKEN';
export type PilotHttpDecision = 'ALLOW' | 'BLOCKED';
export type PilotHttpCapability =
  | AccessCapability
  | 'guest_session'
  | 'service_token';

export type PilotHttpSurfaceEntry = Readonly<{
  id: string;
  source: string;
  method: PilotHttpMethod;
  path: string;
  module: PilotHttpModule;
  entitlement: PilotHttpModule;
  capability: PilotHttpCapability;
  minimumScope: PilotHttpScope;
  storeFilter: PilotHttpStoreFilter;
  effect: PilotHttpEffect;
  principal: PilotHttpPrincipal;
  decision: PilotHttpDecision;
  gaps: readonly string[];
}>;

type ScopeProfile =
  | 'NETWORK_VERIFIED'
  | 'NETWORK_GAP'
  | 'STORES_VERIFIED'
  | 'STORES_GAP'
  | 'LEGACY_STORES_GAP'
  | 'PUBLIC_GAP'
  | 'INTERNAL_ONLY';

type RouteGroup = readonly [
  method: PilotHttpMethod,
  localPaths: readonly string[],
];

type RouteOverride = Readonly<{
  effect?: PilotHttpEffect;
  profile?: ScopeProfile;
  extraGaps?: readonly string[];
}>;

type ControllerDefinition = Readonly<{
  source: string;
  prefix: string;
  module: PilotHttpModule;
  profile: ScopeProfile;
  routes: readonly RouteGroup[];
  overrides?: Readonly<Record<string, RouteOverride>>;
}>;

const assortmentOutboundOverrides = {
  'GET /stores/address-suggestions': {
    effect: 'OUTBOUND',
    profile: 'NETWORK_GAP',
  },
  'GET /stores/address-geocode': {
    effect: 'OUTBOUND',
    profile: 'NETWORK_GAP',
  },
  'GET /stores/yandex-maps-geocode': {
    effect: 'OUTBOUND',
    profile: 'NETWORK_GAP',
  },
  'POST /stores/address-geocode/missing': {
    effect: 'OUTBOUND',
    profile: 'NETWORK_GAP',
  },
  'POST /reports/email': { effect: 'OUTBOUND' },
  'POST /reports/digests/email': { effect: 'OUTBOUND' },
} as const satisfies Readonly<Record<string, RouteOverride>>;

const gamificationOutboundOverrides = {
  'POST /guests/gamification/log/profiles/:profileId/sync': {
    effect: 'OUTBOUND',
  },
  'POST /guests/gamification/log/profiles/:profileId/relink': {
    effect: 'OUTBOUND',
  },
  'POST /guests/gamification/deliveries/dispatch': {
    effect: 'OUTBOUND',
  },
  'POST /guests/gamification/bonus-ledger/dispatch': {
    effect: 'OUTBOUND',
  },
} as const satisfies Readonly<Record<string, RouteOverride>>;

const definitions: readonly ControllerDefinition[] = [
  {
    source: 'src/dashboard/dashboard.controller.ts',
    prefix: '/dashboard',
    module: 'ASSORTMENT',
    profile: 'STORES_VERIFIED',
    routes: [['GET', ['summary', 'revenue-diagnostics']]],
  },
  {
    source: 'src/products/products.controller.ts',
    prefix: '/products',
    module: 'ASSORTMENT',
    profile: 'STORES_GAP',
    routes: [
      ['GET', ['summary', 'catalog', '', ':id']],
      ['POST', ['']],
      ['PATCH', ['bulk-category', ':id']],
      ['DELETE', [':id']],
    ],
    overrides: {
      'GET /products/summary': { profile: 'STORES_VERIFIED' },
      'GET /products/catalog': { profile: 'STORES_VERIFIED' },
      'GET /products': { profile: 'STORES_VERIFIED' },
      'GET /products/:id': { profile: 'STORES_VERIFIED' },
      'POST /products': { profile: 'NETWORK_VERIFIED' },
      'PATCH /products/bulk-category': { profile: 'NETWORK_VERIFIED' },
      'PATCH /products/:id': { profile: 'NETWORK_VERIFIED' },
      'DELETE /products/:id': { profile: 'NETWORK_VERIFIED' },
    },
  },
  {
    source: 'src/categories/categories.controller.ts',
    prefix: '/categories',
    module: 'ASSORTMENT',
    profile: 'NETWORK_GAP',
    routes: [
      ['GET', ['', 'langame/overview']],
      [
        'POST',
        ['langame/preview', 'langame/apply', 'langame/refresh', 'merge', ''],
      ],
      ['PATCH', [':id']],
      ['DELETE', [':id']],
    ],
    overrides: {
      'GET /categories': { profile: 'NETWORK_VERIFIED' },
      'GET /categories/langame/overview': { profile: 'NETWORK_VERIFIED' },
      'POST /categories/langame/preview': { profile: 'NETWORK_VERIFIED' },
      'POST /categories/langame/apply': { profile: 'NETWORK_VERIFIED' },
      'POST /categories/langame/refresh': {
        effect: 'OUTBOUND',
        profile: 'NETWORK_GAP',
      },
      'POST /categories/merge': { profile: 'NETWORK_VERIFIED' },
      'POST /categories': { profile: 'NETWORK_VERIFIED' },
      'PATCH /categories/:id': { profile: 'NETWORK_VERIFIED' },
      'DELETE /categories/:id': { profile: 'NETWORK_VERIFIED' },
    },
  },
  {
    source: 'src/suppliers/suppliers.controller.ts',
    prefix: '/suppliers',
    module: 'ASSORTMENT',
    profile: 'NETWORK_GAP',
    routes: [
      ['GET', ['']],
      ['POST', ['']],
      ['PATCH', [':id']],
      ['DELETE', [':id']],
    ],
    overrides: {
      'GET /suppliers': { profile: 'NETWORK_VERIFIED' },
      'POST /suppliers': { profile: 'NETWORK_VERIFIED' },
      'PATCH /suppliers/:id': { profile: 'NETWORK_VERIFIED' },
      'DELETE /suppliers/:id': { profile: 'NETWORK_VERIFIED' },
    },
  },
  {
    source: 'src/stores/stores.controller.ts',
    prefix: '/stores',
    module: 'ASSORTMENT',
    profile: 'STORES_GAP',
    routes: [
      [
        'GET',
        ['', 'address-suggestions', 'address-geocode', 'yandex-maps-geocode'],
      ],
      ['POST', ['', 'address-geocode/missing']],
      ['PATCH', [':id']],
      ['DELETE', [':id']],
    ],
    overrides: {
      ...assortmentOutboundOverrides,
      'GET /stores': { profile: 'STORES_VERIFIED' },
      'POST /stores': { profile: 'NETWORK_VERIFIED' },
      'PATCH /stores/:id': { profile: 'NETWORK_VERIFIED' },
      'DELETE /stores/:id': { profile: 'NETWORK_VERIFIED' },
    },
  },
  {
    source: 'src/reports/reports.controller.ts',
    prefix: '/reports',
    module: 'ASSORTMENT',
    profile: 'STORES_GAP',
    routes: [
      [
        'GET',
        [
          'assortment',
          'operations',
          'inventory-turnover',
          'assortment-matrix',
          'plan-fact',
          'sales-detail',
          'sku-performance',
          'suppliers-performance',
          'replenishment',
          'new-products',
          'lfl',
          'oos-exclusions',
          'export',
        ],
      ],
      ['POST', ['oos-exclusions', 'email', 'digests/email']],
      ['DELETE', ['oos-exclusions/:id']],
      ['PATCH', ['recommendations/:key/state']],
    ],
    overrides: {
      ...assortmentOutboundOverrides,
      'GET /reports/assortment': { profile: 'STORES_VERIFIED' },
      'GET /reports/operations': { profile: 'STORES_VERIFIED' },
      'GET /reports/inventory-turnover': { profile: 'STORES_VERIFIED' },
      'GET /reports/assortment-matrix': { profile: 'STORES_VERIFIED' },
      'GET /reports/plan-fact': { profile: 'STORES_VERIFIED' },
      'GET /reports/sales-detail': { profile: 'STORES_VERIFIED' },
      'GET /reports/sku-performance': { profile: 'STORES_VERIFIED' },
      'GET /reports/suppliers-performance': { profile: 'STORES_VERIFIED' },
      'GET /reports/replenishment': { profile: 'STORES_VERIFIED' },
      'GET /reports/new-products': { profile: 'STORES_VERIFIED' },
      'GET /reports/lfl': { profile: 'STORES_VERIFIED' },
      'GET /reports/oos-exclusions': { profile: 'NETWORK_VERIFIED' },
      'GET /reports/export': { profile: 'STORES_VERIFIED' },
      'POST /reports/oos-exclusions': { profile: 'NETWORK_VERIFIED' },
      'DELETE /reports/oos-exclusions/:id': {
        profile: 'NETWORK_VERIFIED',
      },
      'PATCH /reports/recommendations/:key/state': {
        profile: 'NETWORK_VERIFIED',
      },
    },
  },
  {
    source: 'src/reports/reports-digest-scheduled.controller.ts',
    prefix: '/reports/digests/scheduled',
    module: 'ASSORTMENT',
    profile: 'INTERNAL_ONLY',
    routes: [['POST', ['']]],
    overrides: {
      'POST /reports/digests/scheduled': { effect: 'OUTBOUND' },
    },
  },
  {
    source: 'src/imports/imports.controller.ts',
    prefix: '/imports',
    module: 'ASSORTMENT',
    profile: 'STORES_GAP',
    routes: [
      ['GET', ['']],
      [
        'POST',
        [
          'products/preview',
          'products',
          'inventory/preview',
          'inventory',
          'sales/preview',
          'sales',
          'movements/preview',
          'movements',
        ],
      ],
    ],
    overrides: {
      'GET /imports': { profile: 'NETWORK_VERIFIED' },
      'POST /imports/products/preview': { profile: 'NETWORK_VERIFIED' },
      'POST /imports/products': { profile: 'NETWORK_VERIFIED' },
      'POST /imports/inventory/preview': { profile: 'NETWORK_VERIFIED' },
      'POST /imports/inventory': { profile: 'NETWORK_VERIFIED' },
      'POST /imports/sales/preview': { profile: 'NETWORK_VERIFIED' },
      'POST /imports/sales': { profile: 'NETWORK_VERIFIED' },
      'POST /imports/movements/preview': { profile: 'NETWORK_VERIFIED' },
      'POST /imports/movements': { profile: 'NETWORK_VERIFIED' },
    },
  },
  {
    source: 'src/utilities/product-parsing.controller.ts',
    prefix: '/utilities/product-parsing',
    module: 'ASSORTMENT',
    profile: 'NETWORK_GAP',
    routes: [
      ['GET', ['', 'manual']],
      [
        'POST',
        [
          'analyze',
          'manual/groups',
          'suggestions/:id/apply',
          'suggestions/:id/reject',
        ],
      ],
      ['PATCH', ['manual/groups/:id']],
    ],
    overrides: {
      'GET /utilities/product-parsing': { profile: 'NETWORK_VERIFIED' },
      'GET /utilities/product-parsing/manual': {
        profile: 'NETWORK_VERIFIED',
      },
      'POST /utilities/product-parsing/analyze': {
        profile: 'NETWORK_VERIFIED',
      },
      'POST /utilities/product-parsing/manual/groups': {
        profile: 'NETWORK_VERIFIED',
      },
      'PATCH /utilities/product-parsing/manual/groups/:id': {
        profile: 'NETWORK_VERIFIED',
      },
      'POST /utilities/product-parsing/suggestions/:id/apply': {
        profile: 'NETWORK_VERIFIED',
      },
      'POST /utilities/product-parsing/suggestions/:id/reject': {
        profile: 'NETWORK_VERIFIED',
      },
    },
  },
  {
    source: 'src/guest-gamification/guest-gamification.controller.ts',
    prefix: '/guests/gamification',
    module: 'GAMIFICATION',
    profile: 'NETWORK_VERIFIED',
    routes: [
      [
        'GET',
        [
          'statistics',
          'workspace',
          'facts',
          'activity-ledger/diagnostics',
          'log/search',
          'log/monitoring',
          'reward-materializer/status',
          'ledger-fallback/status',
          'log/profiles/:profileId',
          'guest-log-catalog/export',
          'profiles',
          'loot-boxes',
          'missions',
          'missions/wizard/product-groups',
          'missions/wizard/:id',
          'seasons',
          'promo-cards',
          'visual-editor/events/sync-status',
          'visual-editor/draft',
          'visual-editor/preview',
          'rewards',
          'rewards/export',
          'overview/export',
          'deliveries',
          'deliveries/export',
          'deliveries/dispatcher',
          'bonus-ledger/status',
          'events',
        ],
      ],
      [
        'POST',
        [
          'dry-run',
          'reward-materializer/run',
          'rule-replays/battle-pass/preview',
          'rule-replays/battle-pass/apply',
          'rule-replays/play-time/canonicalization/preview',
          'rule-replays/play-time/canonicalization/apply',
          'rule-replays/loot-box-entitlements/reconciliation/preview',
          'rule-replays/loot-box-entitlements/reconciliation/apply',
          'rule-replays/loot-box-entitlements/over-limit/preview',
          'rule-replays/loot-box-entitlements/over-limit/apply',
          'log/profiles/:profileId/sync',
          'log/profiles/:profileId/relink',
          'process-event',
          'check-ins',
          'pipeline/run',
          'guest-log-mappings',
          'profiles',
          'loot-boxes',
          'loot-boxes/:id/restart',
          'missions/migrate-active-to-wizard',
          'missions/wizard/readiness',
          'missions/wizard',
          'missions/wizard/:id/activate',
          'missions',
          'seasons',
          'promo-cards',
          'visual-editor/events/sync',
          'visual-editor/draft/publish',
          'rewards/redeem',
          'rewards',
          'deliveries/prepare',
          'deliveries/dispatch',
          'bonus-ledger/queue',
          'bonus-ledger/dispatch',
          'bonus-ledger/:id/reconciliation/resolve',
          'bonus-ledger/:id/cancel',
          'events',
        ],
      ],
      [
        'PATCH',
        [
          'profiles/:id',
          'loot-boxes/:id',
          'missions/wizard/:id',
          'missions/:id/evaluation-policy',
          'missions/:id',
          'seasons/:id',
          'seasons/:id/steps/by-sequence/:sequence/evaluation-policy',
          'promo-cards/:id',
          'visual-editor/draft',
          'rewards/:id',
          'deliveries/:id',
        ],
      ],
      [
        'DELETE',
        [
          'guest-log-mappings/:id',
          'loot-boxes/:id',
          'missions/:id',
          'seasons/:id',
          'promo-cards/:id',
        ],
      ],
    ],
    overrides: gamificationOutboundOverrides,
  },
  {
    source: 'src/guest-gamification/guest-game-media.controller.ts',
    prefix: '/guests/gamification/media',
    module: 'GAMIFICATION',
    profile: 'NETWORK_VERIFIED',
    routes: [['POST', ['']]],
  },
  {
    source: 'src/guest-gamification/guest-game-media.controller.ts',
    prefix: '/public/guest-game/media',
    module: 'GAMIFICATION',
    profile: 'PUBLIC_GAP',
    routes: [['GET', [':id']]],
  },
  {
    source: 'src/guest-gamification/guest-gamification-scheduled.controller.ts',
    prefix: '/guests/gamification/scheduled',
    module: 'GAMIFICATION',
    profile: 'INTERNAL_ONLY',
    routes: [
      [
        'POST',
        [
          'pipeline/run',
          'deliveries/dispatch',
          'deliveries/bot/pull',
          'deliveries/bot/ack',
          'bonus-ledger/dispatch',
        ],
      ],
    ],
    overrides: {
      'POST /guests/gamification/scheduled/deliveries/dispatch': {
        effect: 'OUTBOUND',
      },
      'POST /guests/gamification/scheduled/deliveries/bot/pull': {
        effect: 'OUTBOUND',
      },
      'POST /guests/gamification/scheduled/deliveries/bot/ack': {
        effect: 'OUTBOUND',
      },
      'POST /guests/gamification/scheduled/bonus-ledger/dispatch': {
        effect: 'OUTBOUND',
      },
    },
  },
  {
    source: 'src/guest-portal/guest-portal.controller.ts',
    prefix: '/guest-portal',
    module: 'GAMIFICATION',
    profile: 'PUBLIC_GAP',
    routes: [
      [
        'GET',
        [
          'gamification/clubs',
          ':tenantSlug/:storeId/public-config',
          'session',
          'session/game-missions',
          'session/game-summary',
        ],
      ],
      [
        'POST',
        [
          ':tenantSlug/:storeId/otp/start',
          ':tenantSlug/:storeId/otp/verify',
          ':tenantSlug/:storeId/user-call-auth/start',
          ':tenantSlug/:storeId/user-call-auth/status',
          ':tenantSlug/:storeId/incoming-call-last4/start',
          ':tenantSlug/:storeId/incoming-call-last4/verify',
          ':tenantSlug/:storeId/telegram-auth/start',
          ':tenantSlug/:storeId/telegram-auth/status',
          'session/app-open',
          'session/support/bug-reports',
          'session/completion-notifications/:notificationId/acknowledge',
          'session/reward-wallet/claim-all',
          'session/reward-wallet/items/:walletItemId/claim',
          'session/reward-wallet/items/:walletItemId/open',
          'session/profile',
          'session/loot-boxes/:lootBoxId/open',
          'session/select-club',
          'telegram-mini-app/session',
          'session/check-in',
          'session/langame-match',
          'session/langame-details',
          'session/communications/preferences',
          'session/communications/messenger',
          'session/communications/telegram-link/start',
          'telegram/link/confirm',
          'user-call/confirm',
          'telegram/webhook',
        ],
      ],
    ],
    overrides: {
      'POST /guest-portal/:tenantSlug/:storeId/otp/start': {
        effect: 'OUTBOUND',
      },
      'POST /guest-portal/:tenantSlug/:storeId/user-call-auth/start': {
        effect: 'OUTBOUND',
      },
      'POST /guest-portal/session/communications/messenger': {
        effect: 'OUTBOUND',
      },
      'POST /guest-portal/session/communications/telegram-link/start': {
        effect: 'OUTBOUND',
      },
      'POST /guest-portal/telegram/webhook': { effect: 'OUTBOUND' },
    },
  },
  {
    source: 'src/guests/guests.controller.ts',
    prefix: '/guests',
    module: 'STAFF',
    profile: 'NETWORK_VERIFIED',
    routes: [
      [
        'GET',
        [
          'staff-control/filter-options',
          'staff-control',
          'staff-control/operators',
          'staff-control/operators/export',
          'staff-control/operations',
          'staff-control/operations/export',
          'staff-control/identity-mappings/events',
        ],
      ],
      [
        'POST',
        [
          'staff-control/identity-mappings',
          'staff-control/identity-mappings/events/:id/rollback',
        ],
      ],
      ['DELETE', ['staff-control/identity-mappings/:id']],
    ],
  },
  {
    source: 'src/guests/guests.controller.ts',
    prefix: '/guests',
    module: 'COMMUNICATIONS',
    profile: 'NETWORK_VERIFIED',
    routes: [
      [
        'GET',
        [
          'crm/tasks',
          'crm/tasks/report',
          'crm/tasks/export',
          'crm/users',
          'crm/contact-events',
        ],
      ],
      ['POST', ['crm/tasks', 'crm/contact-events']],
      ['PATCH', ['crm/tasks/:id']],
    ],
  },
  ...staffDefinitions(),
  {
    source: 'src/users/users.controller.ts',
    prefix: '/users',
    module: 'USERS_ROLES',
    profile: 'STORES_VERIFIED',
    routes: [
      ['GET', ['']],
      ['POST', ['', 'invites', 'roles']],
      ['PATCH', ['invites/:id', 'system-roles/:role', ':id', 'roles/:id']],
      ['DELETE', ['invites/:id']],
    ],
    overrides: {
      'POST /users': {
        profile: 'NETWORK_GAP',
        extraGaps: ['ROUTE_INTENTIONALLY_DISABLED'],
      },
      'POST /users/invites': {
        profile: 'NETWORK_GAP',
        extraGaps: [
          'EXTERNAL_INVITE_DELIVERY_WORKFLOW_PENDING',
          'RAW_INVITE_URL_RESPONSE_LEGACY',
        ],
      },
      'PATCH /users/invites/:id': {
        profile: 'NETWORK_GAP',
        extraGaps: [
          'EXTERNAL_INVITE_DELIVERY_WORKFLOW_PENDING',
          'RAW_INVITE_URL_RESPONSE_LEGACY',
        ],
      },
      'DELETE /users/invites/:id': {
        profile: 'NETWORK_GAP',
        extraGaps: ['EXTERNAL_INVITE_WORKFLOW_NOT_ATTESTED'],
      },
      'POST /users/roles': { profile: 'NETWORK_VERIFIED' },
      'PATCH /users/roles/:id': { profile: 'NETWORK_VERIFIED' },
      'PATCH /users/system-roles/:role': { profile: 'NETWORK_VERIFIED' },
    },
  },
  {
    source: 'src/support/support-tickets.controller.ts',
    prefix: '/support/bug-reports',
    module: 'COMMUNICATIONS',
    profile: 'NETWORK_VERIFIED',
    routes: [
      ['GET', ['', ':id/attachments/:attachmentId']],
      ['POST', [':id/comments']],
      ['PATCH', [':id']],
    ],
  },
];

function staffDefinitions(): readonly ControllerDefinition[] {
  return [
    staffController(
      'staff-assessments.controller.ts',
      'assessments',
      'NETWORK_VERIFIED',
      [
        ['GET', ['']],
        ['POST', ['', ':id/results']],
        ['PATCH', [':id']],
      ],
    ),
    staffController(
      'staff-checklist-templates.controller.ts',
      'checklist-templates',
      'STORES_VERIFIED',
      [
        ['GET', ['']],
        ['POST', ['']],
        ['PATCH', [':id']],
        ['DELETE', [':id']],
      ],
    ),
    staffController(
      'staff-attachments.controller.ts',
      'attachments',
      'STORES_VERIFIED',
      [
        ['GET', [':id']],
        ['POST', ['']],
      ],
    ),
    staffController(
      'staff-ai-assistant.controller.ts',
      'ai-assistant',
      'NETWORK_VERIFIED',
      [['GET', ['']]],
    ),
    staffController(
      'staff-directory.controller.ts',
      'directory',
      'STORES_VERIFIED',
      [
        ['GET', ['', 'active-shifts', ':id']],
        ['POST', ['']],
        ['PATCH', [':id']],
      ],
    ),
    staffController(
      'staff-discipline.controller.ts',
      'discipline',
      'NETWORK_VERIFIED',
      [
        ['GET', ['', 'export']],
        ['PATCH', ['policy', 'records/:id']],
        ['POST', ['records']],
      ],
    ),
    staffController(
      'staff-discipline.controller.ts',
      'administrator-ratings',
      'NETWORK_VERIFIED',
      [['GET', ['']]],
    ),
    staffController(
      'staff-checklists.controller.ts',
      'checklists',
      'STORES_VERIFIED',
      [
        ['GET', ['', 'report', 'report/export']],
        [
          'POST',
          [
            '',
            ':id/items/:itemId/review-messages',
            ':id/items/:itemId/review-resolve',
          ],
        ],
        ['PATCH', [':id']],
      ],
    ),
    staffController(
      'staff-knowledge-base.controller.ts',
      'knowledge-base',
      'STORES_VERIFIED',
      [
        ['GET', ['', 'settings']],
        ['PUT', ['settings']],
        ['POST', ['', ':id/read-receipts']],
        ['PATCH', [':id']],
      ],
    ),
    staffController(
      'staff-notifications.controller.ts',
      'notifications',
      'STORES_VERIFIED',
      [
        ['GET', ['']],
        ['POST', ['sync-signals', ':id/acknowledge', ':id/resolve']],
      ],
      'COMMUNICATIONS',
    ),
    staffController(
      'staff-onboarding-plans.controller.ts',
      'onboarding',
      'STORES_VERIFIED',
      [
        ['GET', ['']],
        ['POST', ['']],
        ['PATCH', [':id']],
      ],
    ),
    staffController(
      'staff-operations-dashboard.controller.ts',
      'operations-dashboard',
      'NETWORK_VERIFIED',
      [['GET', ['']]],
    ),
    staffController(
      'staff-readiness-report.controller.ts',
      'readiness-report',
      'NETWORK_VERIFIED',
      [['GET', ['']]],
    ),
    staffController(
      'staff-shift-reports.controller.ts',
      'shift-reports',
      'STORES_VERIFIED',
      [
        ['GET', ['draft']],
        ['POST', ['send']],
      ],
    ),
    staffController(
      'staff-shift-regulations.controller.ts',
      'shift-regulations',
      'STORES_VERIFIED',
      [
        ['GET', ['']],
        ['POST', ['', ':id/acknowledgements']],
        ['PATCH', [':id']],
        ['DELETE', [':id']],
      ],
    ),
    // Salary periods are tenant-wide. Keep this NETWORK-only until the service
    // derives all selectors from fresh allowedStoreIds instead of role checks.
    staffController(
      'staff-salary.controller.ts',
      'salary',
      'NETWORK_VERIFIED',
      [
        ['GET', ['']],
        ['POST', ['periods', 'schemes']],
        ['PATCH', ['periods/:id/rows/:userId', 'schemes/:id']],
      ],
    ),
    staffController(
      'staff-task-recurring-rules.controller.ts',
      'task-rules',
      'STORES_VERIFIED',
      [
        ['GET', ['']],
        ['POST', ['run-due', '', ':id/tasks']],
        ['PATCH', [':id']],
      ],
    ),
    staffController(
      'staff-task-recurring-rules-scheduled.controller.ts',
      'task-rules/scheduled',
      'INTERNAL_ONLY',
      [['POST', ['run-due']]],
    ),
    staffController(
      'staff-shift-workspace.controller.ts',
      'shift-workspace',
      'STORES_VERIFIED',
      [['GET', ['profile']]],
    ),
    staffController(
      'staff-team-chat.controller.ts',
      'team-chat',
      'STORES_VERIFIED',
      [
        ['GET', ['', 'events']],
        ['POST', ['channels', 'messages', 'read']],
        ['PATCH', ['messages/:id']],
      ],
      'COMMUNICATIONS',
    ),
    staffController(
      'staff-task-templates.controller.ts',
      'task-templates',
      'STORES_VERIFIED',
      [
        ['GET', ['']],
        ['POST', ['', ':id/tasks']],
        ['PATCH', [':id']],
      ],
    ),
    staffController(
      'staff-training-courses.controller.ts',
      'training-courses',
      'STORES_VERIFIED',
      [
        ['GET', ['']],
        ['POST', ['']],
        ['PATCH', [':id']],
      ],
    ),
    staffController('staff-tasks.controller.ts', 'tasks', 'STORES_VERIFIED', [
      ['GET', ['', 'export']],
      ['POST', ['', ':id/comments']],
      ['PATCH', [':id']],
    ]),
    staffController(
      'staff-training-profiles.controller.ts',
      'training-profiles',
      'STORES_VERIFIED',
      [
        ['GET', ['', 'export']],
        ['PATCH', ['progress']],
      ],
    ),
  ];
}

function staffController(
  file: string,
  prefix: string,
  profile: ScopeProfile,
  routes: readonly RouteGroup[],
  module: 'STAFF' | 'COMMUNICATIONS' = 'STAFF',
  overrides?: Readonly<Record<string, RouteOverride>>,
): ControllerDefinition {
  return {
    source: `src/staff/${file}`,
    prefix: `/staff/${prefix}`,
    module,
    profile,
    routes,
    ...(overrides ? { overrides } : {}),
  };
}

function joinPath(prefix: string, localPath: string): string {
  return localPath ? `${prefix}/${localPath}` : prefix;
}

function entryId(method: PilotHttpMethod, path: string): string {
  return `${method} ${path}`;
}

function defaultEffect(method: PilotHttpMethod): PilotHttpEffect {
  return method === 'GET' ? 'READ' : 'TENANT_WRITE';
}

function profileFields(
  profile: ScopeProfile,
): Pick<
  PilotHttpSurfaceEntry,
  'minimumScope' | 'storeFilter' | 'principal' | 'decision' | 'gaps'
> {
  switch (profile) {
    case 'NETWORK_VERIFIED':
      return {
        minimumScope: 'NETWORK',
        storeFilter: 'NOT_APPLICABLE',
        principal: 'TENANT_OPERATOR',
        decision: 'ALLOW',
        gaps: [],
      };
    case 'NETWORK_GAP':
      return {
        minimumScope: 'NETWORK',
        storeFilter: 'NOT_APPLICABLE',
        principal: 'TENANT_OPERATOR',
        decision: 'BLOCKED',
        gaps: ['NETWORK_SCOPE_NOT_ASSERTED'],
      };
    case 'STORES_VERIFIED':
      return {
        minimumScope: 'STORES',
        storeFilter: 'REQUIRED',
        principal: 'TENANT_OPERATOR',
        decision: 'ALLOW',
        gaps: [],
      };
    case 'STORES_GAP':
      return {
        minimumScope: 'STORES',
        storeFilter: 'REQUIRED',
        principal: 'TENANT_OPERATOR',
        decision: 'BLOCKED',
        gaps: ['STORE_SCOPE_NOT_ENFORCED_WITH_ALLOWED_STORE_IDS'],
      };
    case 'LEGACY_STORES_GAP':
      return {
        minimumScope: 'STORES',
        storeFilter: 'REQUIRED',
        principal: 'TENANT_OPERATOR',
        decision: 'BLOCKED',
        gaps: [
          'LEGACY_STORE_ACCESS_MODEL_NOT_ATTESTED',
          'ACCESS_SCOPE_REVISION_FRESHNESS_NOT_PROVEN',
        ],
      };
    case 'PUBLIC_GAP':
      return {
        minimumScope: 'STORES',
        storeFilter: 'REQUIRED',
        principal: 'GUEST_SESSION',
        decision: 'BLOCKED',
        gaps: [
          'PUBLIC_TENANT_ENTITLEMENT_ROUTE_UNCLASSIFIED',
          'PUBLIC_STORE_BINDING_NOT_ATTESTED',
        ],
      };
    case 'INTERNAL_ONLY':
      return {
        minimumScope: 'NETWORK',
        storeFilter: 'NOT_APPLICABLE',
        principal: 'SERVICE_TOKEN',
        decision: 'BLOCKED',
        gaps: ['INTERNAL_SERVICE_ROUTE_NOT_AVAILABLE_TO_TENANT_USERS'],
      };
  }
}

function resolveCapability(
  module: PilotHttpModule,
  principal: PilotHttpPrincipal,
  method: PilotHttpMethod,
  path: string,
): PilotHttpCapability {
  if (principal === 'GUEST_SESSION') {
    return 'guest_session';
  }
  if (principal === 'SERVICE_TOKEN') {
    return 'service_token';
  }

  if (module === 'USERS_ROLES') {
    return 'manage_users';
  }
  if (path.startsWith('/support/bug-reports')) {
    return method === 'GET' ? 'view_support_tickets' : 'manage_support_tickets';
  }
  if (module === 'COMMUNICATIONS') {
    return method === 'GET' ? 'view_communications' : 'manage_communications';
  }
  if (module === 'ASSORTMENT') {
    if (path.startsWith('/dashboard')) {
      return 'view_dashboard';
    }
    if (path.startsWith('/reports')) {
      if (
        path.includes('/export') ||
        path.includes('/email') ||
        path.includes('/digest')
      ) {
        return 'export_reports';
      }
      return method === 'GET'
        ? 'view_assortment_reports'
        : 'manage_assortment_reports';
    }
    if (path.startsWith('/products')) {
      return method === 'GET' ? 'view_assortment_products' : 'edit_products';
    }
    if (path.startsWith('/categories') || path.startsWith('/suppliers')) {
      return method === 'GET' ? 'view_assortment_catalog' : 'edit_catalog';
    }
    if (path.startsWith('/stores')) {
      return method === 'GET' ? 'view_assortment_stores' : 'edit_stores';
    }
    if (path.startsWith('/imports')) {
      return 'import_data';
    }
    return 'use_utilities';
  }
  if (module === 'GAMIFICATION') {
    if (path.startsWith('/guests/gamification/bonus-ledger')) {
      return method === 'GET'
        ? 'view_guest_gamification'
        : 'operate_guest_game_ledger';
    }
    if (method === 'GET') {
      if (
        path.startsWith('/guests/gamification/rewards/export') ||
        path.startsWith('/guests/gamification/deliveries/export')
      ) {
        return 'approve_guest_game_rewards';
      }
      return 'view_guest_gamification';
    }
    if (
      path.startsWith('/guests/gamification/rewards') ||
      path.startsWith('/guests/gamification/deliveries/prepare') ||
      path.startsWith('/guests/gamification/deliveries/dispatch') ||
      path.startsWith('/guests/gamification/deliveries/')
    ) {
      return 'approve_guest_game_rewards';
    }
    if (
      path.startsWith('/guests/gamification/dry-run') ||
      path.startsWith('/guests/gamification/facts')
    ) {
      return 'view_guest_gamification';
    }
    return 'manage_guest_game_rules';
  }

  if (path.startsWith('/guests/staff-control')) {
    return method === 'GET' ? 'view_staff_control' : 'manage_staff_control';
  }
  if (
    path.startsWith('/staff/shift-workspace') ||
    path.startsWith('/staff/shift-reports')
  ) {
    return 'view_staff_shift_workspace';
  }
  if (/^\/staff\/tasks\/[^/]+\/comments(?:\/|$)/.test(path)) {
    return 'view_staff_tasks';
  }
  if (
    path.startsWith('/staff/tasks') ||
    path.startsWith('/staff/task-rules') ||
    path.startsWith('/staff/task-templates')
  ) {
    return method === 'GET' ? 'view_staff_tasks' : 'manage_staff_tasks';
  }
  if (
    path.startsWith('/staff/checklists') ||
    path.startsWith('/staff/attachments') ||
    path.startsWith('/staff/shift-regulations') ||
    path.startsWith('/staff/checklist-templates')
  ) {
    return method === 'GET' ? 'view_staff_standards' : 'manage_staff_standards';
  }
  if (
    path.startsWith('/staff/training-courses') ||
    path.startsWith('/staff/training-profiles') ||
    path.startsWith('/staff/readiness-report') ||
    path.startsWith('/staff/onboarding') ||
    path.startsWith('/staff/assessments')
  ) {
    return method === 'GET' ? 'view_staff_training' : 'manage_staff_training';
  }
  if (path.startsWith('/staff/knowledge-base')) {
    return method === 'GET' ? 'view_staff_knowledge' : 'edit_staff_knowledge';
  }
  if (
    path.startsWith('/staff/discipline') ||
    path.startsWith('/staff/operations-dashboard') ||
    path.startsWith('/staff/administrator-ratings') ||
    path.startsWith('/staff/ai-assistant')
  ) {
    return method === 'GET' ? 'view_staff_control' : 'manage_staff_control';
  }
  if (path.startsWith('/staff/directory')) {
    return method === 'GET' ? 'view_staff_directory' : 'manage_staff_directory';
  }
  if (path.startsWith('/staff/salary')) {
    return method === 'GET' ? 'view_staff_salary' : 'manage_staff_salary';
  }
  return 'view_staff';
}

function buildManifest(): readonly PilotHttpSurfaceEntry[] {
  const entries: PilotHttpSurfaceEntry[] = [];

  for (const definition of definitions) {
    for (const [method, localPaths] of definition.routes) {
      for (const localPath of localPaths) {
        const path = joinPath(definition.prefix, localPath);
        const id = entryId(method, path);
        const override = definition.overrides?.[id];
        const fields = profileFields(override?.profile ?? definition.profile);
        const effect = override?.effect ?? defaultEffect(method);
        const gaps = [
          ...fields.gaps,
          ...(override?.extraGaps ?? []),
          ...(effect === 'OUTBOUND' ? ['OUTBOUND_DEFAULT_OFF'] : []),
        ];

        entries.push(
          Object.freeze({
            id,
            source: definition.source,
            method,
            path,
            module: definition.module,
            entitlement: definition.module,
            capability: resolveCapability(
              definition.module,
              fields.principal,
              method,
              path,
            ),
            minimumScope: fields.minimumScope,
            storeFilter: fields.storeFilter,
            effect,
            principal: fields.principal,
            decision:
              effect === 'OUTBOUND' ? ('BLOCKED' as const) : fields.decision,
            gaps: Object.freeze(Array.from(new Set(gaps)).sort()),
          }),
        );
      }
    }
  }

  return Object.freeze(
    entries.sort((left, right) => left.id.localeCompare(right.id)),
  );
}

export const PILOT_HTTP_SURFACE_MANIFEST = buildManifest();

/**
 * Dormant application route policy for the non-canonical CURRENT190 guest
 * session candidate.
 *
 * This file is intentionally not registered in a Nest module and is not used
 * by GuestPortalController. It inventories the existing controller surface and
 * provides a fail-closed adapter for a future, separately reviewed wiring
 * change. Importing this file must never be treated as route activation.
 */

export const GUEST_PORTAL_CURRENT190_ROUTE_CLASSES = [
  'READ',
  'WRITE',
  'OUTBOUND',
  'PUBLIC_BOOTSTRAP',
] as const;

export type GuestPortalCurrent190RouteClass =
  (typeof GUEST_PORTAL_CURRENT190_ROUTE_CLASSES)[number];

export type GuestPortalCurrent190HttpMethod = 'GET' | 'POST';

export type GuestPortalCurrent190Principal =
  | 'GUEST_SESSION'
  | 'PUBLIC_CLIENT'
  | 'TRUSTED_TELEGRAM_EDGE'
  | 'PROVIDER_CALLBACK';

export type GuestPortalCurrent190RequiredBinding =
  | 'PERSISTED_READ'
  | 'PERSISTED_WRITE'
  | 'PERSISTED_ROTATE'
  | 'PERSISTED_ISSUE'
  | 'PUBLIC_STORE_ASSERT'
  | 'PUBLIC_PROJECTION'
  | 'SERVICE_SECRET'
  | 'OUTBOUND_ADMISSION';

export type GuestPortalCurrent190RouteEntry = Readonly<{
  handler: string;
  method: GuestPortalCurrent190HttpMethod;
  path: string;
  classification: GuestPortalCurrent190RouteClass;
  principal: GuestPortalCurrent190Principal;
  requiredBinding: GuestPortalCurrent190RequiredBinding;
}>;

const route = (
  handler: string,
  method: GuestPortalCurrent190HttpMethod,
  path: string,
  classification: GuestPortalCurrent190RouteClass,
  principal: GuestPortalCurrent190Principal,
  requiredBinding: GuestPortalCurrent190RequiredBinding,
): GuestPortalCurrent190RouteEntry =>
  Object.freeze({
    handler,
    method,
    path,
    classification,
    principal,
    requiredBinding,
  });

export const GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST = Object.freeze([
  route(
    'getGamificationClubDirectory',
    'GET',
    '/guest-portal/gamification/clubs',
    'PUBLIC_BOOTSTRAP',
    'PUBLIC_CLIENT',
    'PUBLIC_PROJECTION',
  ),
  route(
    'getPublicConfig',
    'GET',
    '/guest-portal/:tenantSlug/:storeId/public-config',
    'PUBLIC_BOOTSTRAP',
    'PUBLIC_CLIENT',
    'PUBLIC_STORE_ASSERT',
  ),
  route(
    'startOtp',
    'POST',
    '/guest-portal/:tenantSlug/:storeId/otp/start',
    'OUTBOUND',
    'PUBLIC_CLIENT',
    'OUTBOUND_ADMISSION',
  ),
  route(
    'verifyOtp',
    'POST',
    '/guest-portal/:tenantSlug/:storeId/otp/verify',
    'PUBLIC_BOOTSTRAP',
    'PUBLIC_CLIENT',
    'PERSISTED_ISSUE',
  ),
  route(
    'startUserCallAuth',
    'POST',
    '/guest-portal/:tenantSlug/:storeId/user-call-auth/start',
    'OUTBOUND',
    'PUBLIC_CLIENT',
    'OUTBOUND_ADMISSION',
  ),
  route(
    'getUserCallAuthStatus',
    'POST',
    '/guest-portal/:tenantSlug/:storeId/user-call-auth/status',
    'OUTBOUND',
    'PUBLIC_CLIENT',
    'OUTBOUND_ADMISSION',
  ),
  route(
    'startIncomingCallLast4Auth',
    'POST',
    '/guest-portal/:tenantSlug/:storeId/incoming-call-last4/start',
    'OUTBOUND',
    'PUBLIC_CLIENT',
    'OUTBOUND_ADMISSION',
  ),
  route(
    'verifyIncomingCallLast4Auth',
    'POST',
    '/guest-portal/:tenantSlug/:storeId/incoming-call-last4/verify',
    'PUBLIC_BOOTSTRAP',
    'PUBLIC_CLIENT',
    'PERSISTED_ISSUE',
  ),
  route(
    'startTelegramAuth',
    'POST',
    '/guest-portal/:tenantSlug/:storeId/telegram-auth/start',
    'PUBLIC_BOOTSTRAP',
    'PUBLIC_CLIENT',
    'PUBLIC_STORE_ASSERT',
  ),
  route(
    'getTelegramAuthStatus',
    'POST',
    '/guest-portal/:tenantSlug/:storeId/telegram-auth/status',
    'PUBLIC_BOOTSTRAP',
    'PUBLIC_CLIENT',
    'PERSISTED_ISSUE',
  ),
  route(
    'getSession',
    'GET',
    '/guest-portal/session',
    'READ',
    'GUEST_SESSION',
    'PERSISTED_READ',
  ),
  route(
    'getGameSummary',
    'GET',
    '/guest-portal/session/game-summary',
    'READ',
    'GUEST_SESSION',
    'PERSISTED_READ',
  ),
  route(
    'getGameMissions',
    'GET',
    '/guest-portal/session/game-missions',
    'READ',
    'GUEST_SESSION',
    'PERSISTED_READ',
  ),
  route(
    'recordAppOpen',
    'POST',
    '/guest-portal/session/app-open',
    'WRITE',
    'GUEST_SESSION',
    'PERSISTED_WRITE',
  ),
  route(
    'acknowledgeCompletionNotification',
    'POST',
    '/guest-portal/session/completion-notifications/:notificationId/acknowledge',
    'WRITE',
    'GUEST_SESSION',
    'PERSISTED_WRITE',
  ),
  route(
    'claimAllRewardWalletItems',
    'POST',
    '/guest-portal/session/reward-wallet/claim-all',
    'WRITE',
    'GUEST_SESSION',
    'PERSISTED_WRITE',
  ),
  route(
    'claimRewardWalletItem',
    'POST',
    '/guest-portal/session/reward-wallet/items/:walletItemId/claim',
    'WRITE',
    'GUEST_SESSION',
    'PERSISTED_WRITE',
  ),
  route(
    'openRewardWalletLootBoxItem',
    'POST',
    '/guest-portal/session/reward-wallet/items/:walletItemId/open',
    'WRITE',
    'GUEST_SESSION',
    'PERSISTED_WRITE',
  ),
  route(
    'updateProfile',
    'POST',
    '/guest-portal/session/profile',
    'WRITE',
    'GUEST_SESSION',
    'PERSISTED_WRITE',
  ),
  route(
    'openLootBox',
    'POST',
    '/guest-portal/session/loot-boxes/:lootBoxId/open',
    'WRITE',
    'GUEST_SESSION',
    'PERSISTED_WRITE',
  ),
  route(
    'selectGameClub',
    'POST',
    '/guest-portal/session/select-club',
    'WRITE',
    'GUEST_SESSION',
    'PERSISTED_ROTATE',
  ),
  route(
    'exchangeTelegramMiniAppSession',
    'POST',
    '/guest-portal/telegram-mini-app/session',
    'PUBLIC_BOOTSTRAP',
    'TRUSTED_TELEGRAM_EDGE',
    'PERSISTED_ISSUE',
  ),
  route(
    'checkIn',
    'POST',
    '/guest-portal/session/check-in',
    'WRITE',
    'GUEST_SESSION',
    'PERSISTED_WRITE',
  ),
  route(
    'matchLangameGuest',
    'POST',
    '/guest-portal/session/langame-match',
    'OUTBOUND',
    'GUEST_SESSION',
    'OUTBOUND_ADMISSION',
  ),
  route(
    'getLangameGuestDetails',
    'POST',
    '/guest-portal/session/langame-details',
    'OUTBOUND',
    'GUEST_SESSION',
    'OUTBOUND_ADMISSION',
  ),
  route(
    'updateCommunicationPreferences',
    'POST',
    '/guest-portal/session/communications/preferences',
    'WRITE',
    'GUEST_SESSION',
    'PERSISTED_WRITE',
  ),
  route(
    'updateMessengerChannel',
    'POST',
    '/guest-portal/session/communications/messenger',
    'OUTBOUND',
    'GUEST_SESSION',
    'OUTBOUND_ADMISSION',
  ),
  route(
    'startTelegramLink',
    'POST',
    '/guest-portal/session/communications/telegram-link/start',
    'OUTBOUND',
    'GUEST_SESSION',
    'OUTBOUND_ADMISSION',
  ),
  route(
    'confirmTelegramLink',
    'POST',
    '/guest-portal/telegram/link/confirm',
    'PUBLIC_BOOTSTRAP',
    'PROVIDER_CALLBACK',
    'SERVICE_SECRET',
  ),
  route(
    'confirmUserCallAuth',
    'POST',
    '/guest-portal/user-call/confirm',
    'PUBLIC_BOOTSTRAP',
    'PROVIDER_CALLBACK',
    'SERVICE_SECRET',
  ),
  route(
    'handleTelegramWebhook',
    'POST',
    '/guest-portal/telegram/webhook',
    'OUTBOUND',
    'PROVIDER_CALLBACK',
    'OUTBOUND_ADMISSION',
  ),
] as const satisfies readonly GuestPortalCurrent190RouteEntry[]);

export type GuestPortalCurrent190ApplicationBlocker = Readonly<{
  id:
    | 'LOGOUT_PERSISTED_REVOKE'
    | 'MEDIA_TENANT_SCOPED_BEARER'
    | 'LEGACY_PUBLIC_MEDIA_ID_ONLY';
  source: string;
  method: GuestPortalCurrent190HttpMethod;
  path: string;
  currentState: 'DORMANT_CONTROLLER_UNREGISTERED' | 'LEGACY_PUBLIC_ID_ONLY';
  requiredBinding:
    | 'PERSISTED_REVOKE'
    | 'PERSISTED_MEDIA_ASSERT'
    | 'PROTECTED_MEDIA_CUTOVER';
  decision: 'BLOCKED';
}>;

export const GUEST_PORTAL_CURRENT190_APPLICATION_BLOCKERS = Object.freeze([
  Object.freeze({
    id: 'LOGOUT_PERSISTED_REVOKE',
    source: 'src/guest-portal/guest-portal-current190-candidate.controller.ts',
    method: 'POST',
    path: '/guest-portal/session/logout',
    currentState: 'DORMANT_CONTROLLER_UNREGISTERED',
    requiredBinding: 'PERSISTED_REVOKE',
    decision: 'BLOCKED',
  }),
  Object.freeze({
    id: 'MEDIA_TENANT_SCOPED_BEARER',
    source: 'src/guest-portal/guest-portal-current190-candidate.controller.ts',
    method: 'GET',
    path: '/guest-portal/session/media/:id',
    currentState: 'DORMANT_CONTROLLER_UNREGISTERED',
    requiredBinding: 'PERSISTED_MEDIA_ASSERT',
    decision: 'BLOCKED',
  }),
  Object.freeze({
    id: 'LEGACY_PUBLIC_MEDIA_ID_ONLY',
    source: 'src/guest-gamification/guest-game-media.controller.ts',
    method: 'GET',
    path: '/public/guest-game/media/:id',
    currentState: 'LEGACY_PUBLIC_ID_ONLY',
    requiredBinding: 'PROTECTED_MEDIA_CUTOVER',
    decision: 'BLOCKED',
  }),
] as const satisfies readonly GuestPortalCurrent190ApplicationBlocker[]);

export type GuestPortalCurrent190ExpectedScope = Readonly<{
  tenantId?: string;
  storeId?: string;
  profileId?: string;
  guestId?: string | null;
}>;

export interface GuestPortalCurrent190SessionAuthorizationPort {
  authorize: (
    authorization: string | undefined,
    action: 'READ' | 'WRITE',
    expectedScope?: GuestPortalCurrent190ExpectedScope,
  ) => Promise<unknown>;
}

export type GuestPortalCurrent190AdmissionReason =
  | 'UNKNOWN_ROUTE'
  | 'OUTBOUND_DISABLED'
  | 'PUBLIC_BOOTSTRAP_NOT_PROMOTED'
  | 'PERSISTED_ROTATION_NOT_WIRED'
  | 'INVALID_POLICY_ENTRY'
  | 'SESSION_ADMISSION_DENIED';

export type GuestPortalCurrent190AdmissionDecision =
  | Readonly<{
      allowed: true;
      route: GuestPortalCurrent190RouteEntry;
      action: 'READ' | 'WRITE';
      evidence: unknown;
    }>
  | Readonly<{
      allowed: false;
      route: GuestPortalCurrent190RouteEntry | null;
      reason: GuestPortalCurrent190AdmissionReason;
    }>;

export type GuestPortalCurrent190AdmissionInput = Readonly<{
  handler: string;
  method: string;
  path: string;
  authorization?: string;
  expectedScope?: GuestPortalCurrent190ExpectedScope;
}>;

const manifestByExactRoute = new Map(
  GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST.map((entry) => [
    `${entry.handler}\u0000${entry.method}\u0000${entry.path}`,
    entry,
  ]),
);

export const findGuestPortalCurrent190Route = (
  handler: string,
  method: string,
  path: string,
): GuestPortalCurrent190RouteEntry | null =>
  manifestByExactRoute.get(`${handler}\u0000${method}\u0000${path}`) ?? null;

/**
 * Candidate-only bridge from exact controller metadata to persisted session
 * authorization. It is deliberately undecorated and absent from every module.
 */
export class GuestPortalCurrent190DormantRoutePolicy {
  constructor(
    private readonly session: GuestPortalCurrent190SessionAuthorizationPort,
  ) {}

  readiness() {
    return {
      status: 'DORMANT_APPLICATION_ROUTE_POLICY',
      canonical: false,
      deployable: false,
      registeredInModule: false,
      productionRoutesChanged: false,
      routeActivationAllowed: false,
      outboundAllowed: false,
      publicBootstrapAllowed: false,
      inventoryCount: GUEST_PORTAL_CURRENT190_ROUTE_MANIFEST.length,
      blockerCount: GUEST_PORTAL_CURRENT190_APPLICATION_BLOCKERS.length,
    } as const;
  }

  async admit(
    input: GuestPortalCurrent190AdmissionInput,
  ): Promise<GuestPortalCurrent190AdmissionDecision> {
    const routeEntry = findGuestPortalCurrent190Route(
      input.handler,
      input.method,
      input.path,
    );

    if (!routeEntry) {
      return { allowed: false, route: null, reason: 'UNKNOWN_ROUTE' };
    }

    if (routeEntry.classification === 'OUTBOUND') {
      return {
        allowed: false,
        route: routeEntry,
        reason: 'OUTBOUND_DISABLED',
      };
    }

    if (routeEntry.classification === 'PUBLIC_BOOTSTRAP') {
      return {
        allowed: false,
        route: routeEntry,
        reason: 'PUBLIC_BOOTSTRAP_NOT_PROMOTED',
      };
    }

    if (routeEntry.requiredBinding === 'PERSISTED_ROTATE') {
      return {
        allowed: false,
        route: routeEntry,
        reason: 'PERSISTED_ROTATION_NOT_WIRED',
      };
    }

    const action = routeEntry.classification;
    if (
      (action !== 'READ' && action !== 'WRITE') ||
      routeEntry.principal !== 'GUEST_SESSION' ||
      routeEntry.requiredBinding !== `PERSISTED_${action}`
    ) {
      return {
        allowed: false,
        route: routeEntry,
        reason: 'INVALID_POLICY_ENTRY',
      };
    }

    try {
      const evidence = await this.session.authorize(
        input.authorization,
        action,
        input.expectedScope,
      );
      if (evidence === null || evidence === undefined) {
        throw new Error('CURRENT190 session admission returned no evidence');
      }
      return { allowed: true, route: routeEntry, action, evidence };
    } catch {
      return {
        allowed: false,
        route: routeEntry,
        reason: 'SESSION_ADMISSION_DENIED',
      };
    }
  }
}

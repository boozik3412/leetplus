export const GUEST_GAME_DELIVERY_REQUIRED_PROTOCOL_VERSION = 1 as const;

export const GUEST_GAME_DELIVERY_LEGACY_PROTOCOL_DENIAL_REASON =
  'LEGACY_DELIVERY_PROTOCOL_NOT_ACCEPTED' as const;

export const GUEST_GAME_DELIVERY_LEGACY_PREPARE_DENIAL_REASON =
  'LEGACY_DELIVERY_PREPARE_MUTATION_NOT_ACCEPTED' as const;

export const GUEST_GAME_DELIVERY_LEGACY_UPDATE_DENIAL_REASON =
  'LEGACY_DELIVERY_UPDATE_MUTATION_NOT_ACCEPTED' as const;

export const GUEST_GAME_DELIVERY_LEGACY_ACK_DENIAL_REASON =
  'LEGACY_DELIVERY_ACK_MUTATION_NOT_ACCEPTED' as const;

export const GUEST_GAME_DELIVERY_LEGACY_REVOKE_DENIAL_REASON =
  'LEGACY_DELIVERY_REVOKE_MUTATION_NOT_ACCEPTED' as const;

export const GUEST_GAME_DELIVERY_LEGACY_UNSUBSCRIBE_DENIAL_REASON =
  'LEGACY_DELIVERY_UNSUBSCRIBE_MUTATION_NOT_ACCEPTED' as const;

export type GuestGameLegacyDeliveryPath =
  | 'LEGACY_DIRECT_PROVIDER'
  | 'LEGACY_BOT_PULL'
  | 'LEGACY_PROVIDER_PREPARE'
  | 'LEGACY_PROVIDER_UPDATE'
  | 'LEGACY_BOT_ACK'
  | 'LEGACY_PROVIDER_REVOKE'
  | 'LEGACY_PROVIDER_UNSUBSCRIBE';

export type GuestGameDeliveryProtocolDenialReason =
  | typeof GUEST_GAME_DELIVERY_LEGACY_PROTOCOL_DENIAL_REASON
  | typeof GUEST_GAME_DELIVERY_LEGACY_PREPARE_DENIAL_REASON
  | typeof GUEST_GAME_DELIVERY_LEGACY_UPDATE_DENIAL_REASON
  | typeof GUEST_GAME_DELIVERY_LEGACY_ACK_DENIAL_REASON
  | typeof GUEST_GAME_DELIVERY_LEGACY_REVOKE_DENIAL_REASON
  | typeof GUEST_GAME_DELIVERY_LEGACY_UNSUBSCRIBE_DENIAL_REASON;

export type GuestGameDeliveryProtocolGateDecision = {
  allowed: boolean;
  path: GuestGameLegacyDeliveryPath;
  reasonCode: GuestGameDeliveryProtocolDenialReason;
  requiredProtocolVersion: typeof GUEST_GAME_DELIVERY_REQUIRED_PROTOCOL_VERSION;
  acceptedProtocolVersion: null;
  coordinatorReady: false;
  note: string;
};

const denialNotes: Record<GuestGameLegacyDeliveryPath, string> = {
  LEGACY_DIRECT_PROVIDER:
    'Legacy guest-game direct provider effect denied: accepted delivery protocol v1 coordinator is not deployed; the real-send request was forced to dry-run.',
  LEGACY_BOT_PULL:
    'Legacy guest-game bot pull denied: accepted delivery protocol v1 coordinator is not deployed; no sendable payload was returned.',
  LEGACY_PROVIDER_PREPARE:
    'Legacy guest-game Telegram/MAX preparation denied: accepted delivery protocol v1 coordinator is not deployed; provider delivery rows were not created or refreshed. CASHIER/MANUAL preparation remains available.',
  LEGACY_PROVIDER_UPDATE:
    'Legacy guest-game Telegram/MAX delivery update denied: accepted delivery protocol v1 coordinator is not deployed; the provider delivery row was not changed.',
  LEGACY_BOT_ACK:
    'Legacy guest-game bot ack denied: accepted delivery protocol v1 coordinator is not deployed; stale provider acknowledgements cannot mutate delivery rows.',
  LEGACY_PROVIDER_REVOKE:
    'Legacy guest-game Telegram/MAX revoke denied: accepted delivery protocol v1 coordinator is not deployed; provider delivery rows and events were preserved. Reward and ledger cancellation continued, and CASHIER/MANUAL delivery cancellation remains available.',
  LEGACY_PROVIDER_UNSUBSCRIBE:
    'Legacy guest-game Telegram unsubscribe mutation denied: accepted delivery protocol v1 coordinator is not deployed; provider delivery rows and events were preserved while guest communication consent was updated.',
};

const denialReasons: Record<
  GuestGameLegacyDeliveryPath,
  GuestGameDeliveryProtocolDenialReason
> = {
  LEGACY_DIRECT_PROVIDER: GUEST_GAME_DELIVERY_LEGACY_PROTOCOL_DENIAL_REASON,
  LEGACY_BOT_PULL: GUEST_GAME_DELIVERY_LEGACY_PROTOCOL_DENIAL_REASON,
  LEGACY_PROVIDER_PREPARE: GUEST_GAME_DELIVERY_LEGACY_PREPARE_DENIAL_REASON,
  LEGACY_PROVIDER_UPDATE: GUEST_GAME_DELIVERY_LEGACY_UPDATE_DENIAL_REASON,
  LEGACY_BOT_ACK: GUEST_GAME_DELIVERY_LEGACY_ACK_DENIAL_REASON,
  LEGACY_PROVIDER_REVOKE: GUEST_GAME_DELIVERY_LEGACY_REVOKE_DENIAL_REASON,
  LEGACY_PROVIDER_UNSUBSCRIBE:
    GUEST_GAME_DELIVERY_LEGACY_UNSUBSCRIBE_DENIAL_REASON,
};

export function isLegacyGuestGameProviderDeliveryChannel(
  channel: string | null | undefined,
): channel is 'TELEGRAM' | 'MAX' {
  return channel === 'TELEGRAM' || channel === 'MAX';
}

/**
 * The legacy delivery paths have no accepted ownership/fencing protocol.
 * This gate intentionally has no environment or tenant bypass: only a future
 * accepted protocol implementation may replace this default-deny decision.
 */
export function evaluateLegacyGuestGameDeliveryProtocolGate(
  path: GuestGameLegacyDeliveryPath,
): GuestGameDeliveryProtocolGateDecision {
  return {
    allowed: false,
    path,
    reasonCode: denialReasons[path],
    requiredProtocolVersion: GUEST_GAME_DELIVERY_REQUIRED_PROTOCOL_VERSION,
    acceptedProtocolVersion: null,
    coordinatorReady: false,
    note: denialNotes[path],
  };
}

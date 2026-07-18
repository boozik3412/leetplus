export const guestGameEvaluationPolicies = [
  'LIVE_PRIMARY',
  'LIVE_WITH_LEDGER_FALLBACK',
  'LEDGER_SUPPLEMENTAL',
] as const;

export type GuestGameEvaluationPolicy =
  (typeof guestGameEvaluationPolicies)[number];

export const guestGameEvaluationModes = [
  'LIVE',
  'LIVE_SUPPLEMENTAL',
  'LIVE_LEDGER_FALLBACK',
] as const;

export type GuestGameEvaluationMode = (typeof guestGameEvaluationModes)[number];

export function guestGameEvaluationPolicy(
  value: unknown,
): GuestGameEvaluationPolicy {
  const normalized =
    typeof value === 'string' ? value.trim().toUpperCase() : '';
  return guestGameEvaluationPolicies.includes(
    normalized as GuestGameEvaluationPolicy,
  )
    ? (normalized as GuestGameEvaluationPolicy)
    : 'LIVE_PRIMARY';
}

export function guestGamePolicyAllowsEvaluation(
  policyValue: unknown,
  mode: GuestGameEvaluationMode,
) {
  const policy = guestGameEvaluationPolicy(policyValue);

  if (mode === 'LIVE_SUPPLEMENTAL') {
    return policy === 'LEDGER_SUPPLEMENTAL';
  }
  if (mode === 'LIVE_LEDGER_FALLBACK') {
    return policy === 'LIVE_WITH_LEDGER_FALLBACK';
  }

  return policy === 'LIVE_PRIMARY' || policy === 'LIVE_WITH_LEDGER_FALLBACK';
}

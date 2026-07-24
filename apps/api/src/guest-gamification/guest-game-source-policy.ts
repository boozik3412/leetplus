import {
  guestGameMissionDefinitionVersion,
  missionEvaluationPolicy,
  missionTaskTypeFromConditions,
} from './guest-game-mission-contract';
import { guestGameTriggerMatches } from './guest-game-progress';

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

export function guestGameMissionEvaluationPolicy(
  definitionVersionValue: unknown,
  conditionsValue: unknown,
  missionTypeValue: unknown,
  storedPolicyValue: unknown,
  triggerKindValue?: unknown,
): GuestGameEvaluationPolicy {
  const taskType = missionTaskTypeFromConditions(
    conditionsValue,
    missionTypeValue,
  );
  // PLAY_TIME is a semantic source contract, not an operator-selectable
  // preference. Apply the exact-ledger fallback to legacy and v2 missions so
  // an old scalar policy cannot silently disable deserved progress.
  if (taskType === 'PLAY_TIME') {
    return 'LIVE_WITH_LEDGER_FALLBACK';
  }
  if (
    guestGameMissionMatchesSessionStart(
      conditionsValue,
      missionTypeValue,
      triggerKindValue,
    )
  ) {
    return 'LIVE_WITH_LEDGER_FALLBACK';
  }

  const definitionVersion = Number(definitionVersionValue);
  if (
    Number.isFinite(definitionVersion) &&
    definitionVersion >= guestGameMissionDefinitionVersion &&
    taskType
  ) {
    return missionEvaluationPolicy(taskType);
  }

  return guestGameEvaluationPolicy(storedPolicyValue);
}

/**
 * Loot boxes predate the scalar evaluation-policy column used by missions.
 * Keep their policy inside periodRules so the contract stays migration-free,
 * while legacy PLAY_HOUR and SESSION_START rules inherit the safe
 * exact-ledger fallback. The dedicated session recovery remains a compatible
 * LIVE source, while Ledger can repair a missed start without duplicating it.
 */
export function guestGameLootBoxEvaluationPolicy(
  triggerKindValue: unknown,
  periodRulesValue: unknown,
): GuestGameEvaluationPolicy {
  const triggerKind =
    typeof triggerKindValue === 'string'
      ? triggerKindValue.trim().toUpperCase()
      : '';
  // PLAY_HOUR and SESSION_START loot boxes consume canonical session facts.
  // A stale embedded policy must not opt either rule family out of the safety
  // layer.
  if (triggerKind === 'PLAY_HOUR' || triggerKind === 'SESSION_START') {
    return 'LIVE_WITH_LEDGER_FALLBACK';
  }

  const configuredPolicy =
    isRecord(periodRulesValue) && 'evaluationPolicy' in periodRulesValue
      ? periodRulesValue.evaluationPolicy
      : null;
  if (configuredPolicy != null) {
    return guestGameEvaluationPolicy(configuredPolicy);
  }

  return 'LIVE_PRIMARY';
}

export function guestGameBattlePassStepEvaluationPolicy(
  activationRulesValue: unknown,
): GuestGameEvaluationPolicy {
  if (!isRecord(activationRulesValue)) {
    return 'LIVE_PRIMARY';
  }

  const taskType =
    typeof activationRulesValue.taskType === 'string'
      ? activationRulesValue.taskType.trim().toUpperCase()
      : '';
  const isSemanticPlayTime = taskType
    ? taskType === 'PLAY_TIME'
    : guestGameRuleMatchesEvent(
        activationRulesValue,
        guestGamePlayTimeMarkerMatches,
      );

  if (
    isSemanticPlayTime ||
    guestGameBattlePassStepMatchesSessionStart(activationRulesValue)
  ) {
    return 'LIVE_WITH_LEDGER_FALLBACK';
  }

  return guestGameEvaluationPolicy(activationRulesValue.evaluationPolicy);
}

/**
 * The progress evaluator treats any explicit event marker as authoritative and
 * only falls back to triggerKind when no marker exists. Keep the source router
 * and the cheap live-session preflight on that same precedence.
 */
export function guestGameBattlePassStepMatchesSessionStart(
  activationRulesValue: unknown,
) {
  const activationRules = isRecord(activationRulesValue)
    ? activationRulesValue
    : {};
  return guestGameRuleMatchesSessionStart(activationRules, [
    activationRules.taskType,
  ]);
}

/**
 * Legacy missions may have kept the SESSION_START semantic in conditions,
 * missionType, or the denormalized trigger column. Those are fallback signals
 * only: an explicit event marker still wins, including a non-start marker.
 */
export function guestGameMissionMatchesSessionStart(
  conditionsValue: unknown,
  missionTypeValue: unknown,
  triggerKindValue?: unknown,
) {
  const conditions = isRecord(conditionsValue) ? conditionsValue : {};
  return guestGameRuleMatchesSessionStart(conditions, [
    conditions.taskType,
    missionTypeValue,
    triggerKindValue,
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function guestGameRuleMatchesSessionStart(
  ruleValue: unknown,
  fallbackValues: unknown[] = [],
) {
  return guestGameRuleMatchesEvent(
    ruleValue,
    (eventType) => guestGameTriggerMatches(eventType, 'SESSION_START'),
    fallbackValues,
  );
}

function guestGameRuleMatchesEvent(
  ruleValue: unknown,
  markerMatches: (value: string) => boolean,
  fallbackValues: unknown[] = [],
) {
  if (!isRecord(ruleValue)) return false;

  const eventTypes = ruleEventTypes(ruleValue);
  if (eventTypes.length) {
    return eventTypes.some(markerMatches);
  }

  const triggerKind = normalizedString(ruleValue.triggerKind);
  if (triggerKind) {
    return markerMatches(triggerKind);
  }

  return stringValues(...fallbackValues).some(markerMatches);
}

function guestGamePlayTimeMarkerMatches(value: string) {
  return (
    value === 'PLAY_TIME' ||
    guestGameTriggerMatches(value, 'PLAY_HOUR') ||
    guestGameTriggerMatches(value, 'SESSION_STOP')
  );
}

function ruleEventTypes(rule: Record<string, unknown>) {
  const metric = isRecord(rule.metric) ? rule.metric : {};
  return stringValues(
    metric.eventTypes,
    metric.eventType,
    rule.eventTypes,
    rule.eventType,
  );
}

function stringValues(...values: unknown[]) {
  return values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value
        .map(normalizedString)
        .filter((item): item is string => Boolean(item));
    }

    const stringValue = normalizedString(value);
    return stringValue ? [stringValue] : [];
  });
}

function normalizedString(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim().toUpperCase()
    : null;
}

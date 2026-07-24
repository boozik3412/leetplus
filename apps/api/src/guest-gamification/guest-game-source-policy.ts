import {
  guestGameMissionDefinitionVersion,
  missionEvaluationPolicy,
  missionTaskTypeFromConditions,
} from './guest-game-mission-contract';

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
 * while legacy PLAY_HOUR rules inherit the safe exact-ledger fallback.
 * Session-start loot boxes remain on their dedicated recovery pipeline.
 */
export function guestGameLootBoxEvaluationPolicy(
  triggerKindValue: unknown,
  periodRulesValue: unknown,
): GuestGameEvaluationPolicy {
  const triggerKind =
    typeof triggerKindValue === 'string'
      ? triggerKindValue.trim().toUpperCase()
      : '';
  // PLAY_HOUR loot boxes consume the same canonical duration facts as
  // missions and Battle Pass. A stale embedded policy must not opt the rule
  // out of the safety layer.
  if (triggerKind === 'PLAY_HOUR') {
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
  const triggerKind =
    typeof activationRulesValue.triggerKind === 'string'
      ? activationRulesValue.triggerKind.trim().toUpperCase()
      : '';
  const metric = isRecord(activationRulesValue.metric)
    ? activationRulesValue.metric
    : {};
  const metricEventTypes = stringArray(metric.eventTypes);
  const eventTypes = [
    ...stringArray(activationRulesValue.eventTypes),
    ...metricEventTypes,
  ];
  const isSemanticPlayTime = taskType
    ? taskType === 'PLAY_TIME'
    : triggerKind
      ? triggerKind === 'PLAY_HOUR' || triggerKind === 'SESSION_STOP'
      : eventTypes.some((value) =>
          ['PLAY_TIME', 'PLAY_HOUR', 'SESSION_STOP'].includes(value),
        );

  if (isSemanticPlayTime) {
    return 'LIVE_WITH_LEDGER_FALLBACK';
  }

  return guestGameEvaluationPolicy(activationRulesValue.evaluationPolicy);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    : [];
}

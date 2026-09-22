import { createHash } from 'node:crypto';

export type BalanceTopupReplayHistoricalStepOverride = Readonly<{
  activationRules: Readonly<{
    schemaVersion: 2;
    taskType: 'BALANCE_TOPUP';
    triggerKind: 'BALANCE_TOPUP';
    evaluationPolicy: 'LEDGER_SUPPLEMENTAL';
    domainScoped: true;
    externalDomains: readonly ['46.langamepro.ru'];
    metric: Readonly<{
      minSpendAmount: 500;
      amountComparison: 'AT_LEAST';
      topupMode: 'SINGLE';
      windowDays: 300;
      hours: readonly [];
      eventTypes: readonly ['BALANCE_TOPUP'];
    }>;
  }>;
  freeRewardDetails: Readonly<{
    type: 'BONUS_BALANCE';
    amount: 150;
    delivery: 'AUTO';
  }>;
}>;

type BalanceTopupReplayAttestation = {
  ticketNumber: string;
  profileId: string;
  guestId: string;
  factId: string;
  seasonId: string;
  stepId: string;
  stepSequence: number;
  configuredStepReward: {
    type: 'BONUS_BALANCE';
    amount: number;
  };
  emittedRuleReward: {
    type: 'BONUS_BALANCE';
    amount: number;
  };
  condition: {
    taskType: 'BALANCE_TOPUP';
    amountComparison: 'AT_LEAST';
    minSpendAmount: number;
    topupMode: 'SINGLE';
    domainScoped: true;
    windowDays: number;
    hours: readonly [];
  };
  permittedEffectiveHoursDrift: readonly ['09:00-21:00'];
  historicalStepOverride: BalanceTopupReplayHistoricalStepOverride;
};

const exact571Attestation = {
  ticketNumber: 'LP-BUG-571075E9',
  profileId: '25fc121f-c69a-4050-9bda-6def1424f45d',
  guestId: '87daa389-5254-4a2b-bc23-c47ad3a5e951',
  factId: 'cdd5e66f-d27a-42b8-b2df-2f2cad70940c',
  seasonId: '90e8eb75-2727-4f8d-808c-42a3ff981ce2',
  stepId: 'level-3',
  stepSequence: 3,
  configuredStepReward: {
    type: 'BONUS_BALANCE',
    amount: 150,
  },
  emittedRuleReward: {
    type: 'BONUS_BALANCE',
    amount: 150,
  },
  condition: {
    taskType: 'BALANCE_TOPUP',
    amountComparison: 'AT_LEAST',
    minSpendAmount: 500,
    topupMode: 'SINGLE',
    domainScoped: true,
    windowDays: 300,
    hours: [],
  },
  // The owner-attested historical step had no time-of-day gate. The later
  // active definition's exact 09:00-21:00 value is tolerated only as this
  // pinned, ticket-specific drift; all other definition changes fail closed.
  permittedEffectiveHoursDrift: ['09:00-21:00'],
  historicalStepOverride: {
    activationRules: {
      schemaVersion: 2,
      taskType: 'BALANCE_TOPUP',
      triggerKind: 'BALANCE_TOPUP',
      evaluationPolicy: 'LEDGER_SUPPLEMENTAL',
      domainScoped: true,
      externalDomains: ['46.langamepro.ru'],
      metric: {
        minSpendAmount: 500,
        amountComparison: 'AT_LEAST',
        topupMode: 'SINGLE',
        windowDays: 300,
        hours: [],
        eventTypes: ['BALANCE_TOPUP'],
      },
    },
    freeRewardDetails: {
      type: 'BONUS_BALANCE',
      amount: 150,
      delivery: 'AUTO',
    },
  },
} as const satisfies BalanceTopupReplayAttestation;

export function exactBalanceTopupReplayAttestation(input: {
  ticketNumber: string;
  profileId: string;
  guestId: string | null;
  factId: string;
  seasonId: string;
  stepId: string;
  stepSequence: number;
}) {
  const attestation = exact571Attestation;
  if (
    input.ticketNumber !== attestation.ticketNumber ||
    input.profileId !== attestation.profileId ||
    input.guestId !== attestation.guestId ||
    input.factId !== attestation.factId ||
    input.seasonId !== attestation.seasonId ||
    input.stepId !== attestation.stepId ||
    input.stepSequence !== attestation.stepSequence
  ) {
    return null;
  }
  return {
    ...attestation,
    digest: createHash('sha256')
      .update(JSON.stringify(attestation))
      .digest('hex'),
  };
}

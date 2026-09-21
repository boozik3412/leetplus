import { createHash } from 'node:crypto';

type BalanceTopupReplayAttestation = {
  ticketNumber: string;
  profileId: string;
  guestId: string;
  factId: string;
  seasonId: string;
  stepId: string;
  stepSequence: number;
  rewardType: 'BATTLE_PASS_REWARD';
  rewardAmount: number;
  condition: {
    taskType: 'BALANCE_TOPUP';
    amountComparison: 'AT_LEAST';
    minSpendAmount: number;
    topupMode: 'SINGLE';
    domainScoped: true;
    windowDays: number;
    hours: readonly [];
  };
};

const exact571Attestation = {
  ticketNumber: 'LP-BUG-571075E9',
  profileId: '25fc121f-c69a-4050-9bda-6def1424f45d',
  guestId: '87daa389-5254-4a2b-bc23-c47ad3a5e951',
  factId: 'cdd5e66f-d27a-42b8-b2df-2f2cad70940c',
  seasonId: '90e8eb75-2727-4f8d-808c-42a3ff981ce2',
  stepId: 'level-3',
  stepSequence: 3,
  rewardType: 'BATTLE_PASS_REWARD',
  rewardAmount: 150,
  condition: {
    taskType: 'BALANCE_TOPUP',
    amountComparison: 'AT_LEAST',
    minSpendAmount: 500,
    topupMode: 'SINGLE',
    domainScoped: true,
    windowDays: 300,
    hours: [],
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

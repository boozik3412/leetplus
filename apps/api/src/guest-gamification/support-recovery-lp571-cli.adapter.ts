import { ConflictException } from '@nestjs/common';

export const LP571 = Object.freeze({
  ticketNumber: 'LP-BUG-571075E9',
  profileId: '25fc121f-c69a-4050-9bda-6def1424f45d',
  factId: 'cdd5e66f-d27a-42b8-b2df-2f2cad70940c',
  seasonId: '90e8eb75-2727-4f8d-808c-42a3ff981ce2',
  stepId: 'level-3',
  stepSequence: 3,
});

export type Lp571PreviewResult = Readonly<{ confirmationHash: string }>;
export type Lp571ApplyResult = Readonly<{ confirmationHash: string }>;
type Replay = {
  previewBattlePass(user: unknown, dto: unknown): Promise<Lp571PreviewResult>;
  applyBattlePass(user: unknown, dto: unknown): Promise<Lp571ApplyResult>;
};
export function createLp571RecoveryAdapter(replay: Replay, user: unknown) {
  const request = Object.freeze({
    factId: LP571.factId,
    profileId: LP571.profileId,
    seasonId: LP571.seasonId,
    stepId: LP571.stepId,
    stepSequence: LP571.stepSequence,
    supportTicketNumber: LP571.ticketNumber,
  });
  return {
    preview: () => replay.previewBattlePass(user, request),
    // Reconcile intentionally performs only the canonical preview/read path.
    reconcile: () => replay.previewBattlePass(user, request),
    async apply(
      previewDigest: string,
      expectedFactUpdatedAt: string,
      expectedSeasonUpdatedAt: string,
    ) {
      const preview = await replay.previewBattlePass(user, request);
      if (preview.confirmationHash !== previewDigest)
        throw new ConflictException('LP571 preview digest drifted.');
      return replay.applyBattlePass(user, {
        ...request,
        expectedFactUpdatedAt,
        expectedSeasonUpdatedAt,
        confirmationHash: previewDigest,
        confirmation: 'APPLY_RULE_REPLAY',
      });
    },
  };
}

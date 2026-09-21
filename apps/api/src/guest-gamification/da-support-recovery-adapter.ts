import { ConflictException } from '@nestjs/common';

export const DA_SUPPORT_RECOVERY = Object.freeze({
  ticketNumber: 'LP-BUG-DA592E20',
  ticketId: 'ab5f7f9e-f3a1-44dc-bd52-66a7ff7cb19c',
  factId: 'ccffb7ba-f93d-4c4d-958f-de3db4c533fe',
  ruleId: '0ce6f7e3-99ea-4aa2-b6e2-68e8dbd1bb12',
  confirmationPrefix: 'APPLY_DA_SUPPORT_RECOVERY ',
});

export type DaSupportMode = 'preview' | 'apply' | 'reconcile';

export function parseDaSupportMode(value: string | undefined): DaSupportMode {
  if (value === 'preview' || value === 'apply' || value === 'reconcile') return value;
  throw new ConflictException('DA support mode must be preview, apply, or reconcile.');
}

export function assertDaApplyConfirmation(value: string | undefined, digest: string) {
  if (value !== `${DA_SUPPORT_RECOVERY.confirmationPrefix}${digest}`)
    throw new ConflictException('DA apply confirmation must bind the fresh preview digest.');
}

export function daSupportRequest() {
  return {
    ticketNumber: DA_SUPPORT_RECOVERY.ticketNumber,
    actions: [{ factId: DA_SUPPORT_RECOVERY.factId, ruleKind: 'LOOT_BOX' as const, ruleId: DA_SUPPORT_RECOVERY.ruleId }],
  };
}

export interface DaRecoveryService {
  previewSupportRewardRecovery(user: unknown, request: ReturnType<typeof daSupportRequest>): Promise<unknown>;
  applySupportRewardRecovery(user: unknown, request: ReturnType<typeof daSupportRequest> & { expectedActionCount: number; expectedDigest: string; allowedRuleIds: string[]; confirmation: string }): Promise<unknown>;
}

export async function runDaSupportRecovery(input: {
  service: DaRecoveryService;
  user: unknown;
  mode: DaSupportMode;
  preview?: { actionCount: number; digest: string; allowedRuleIds: string[] };
  confirmation?: string;
}) {
  const request = daSupportRequest();
  if (input.mode === 'preview' || input.mode === 'reconcile')
    return input.service.previewSupportRewardRecovery(input.user, request);
  if (!input.preview) throw new ConflictException('DA apply requires the immediately preceding preview.');
  assertDaApplyConfirmation(input.confirmation, input.preview.digest);
  return input.service.applySupportRewardRecovery(input.user, {
    ...request,
    expectedActionCount: input.preview.actionCount,
    expectedDigest: input.preview.digest,
    allowedRuleIds: input.preview.allowedRuleIds,
    confirmation: 'APPLY_SUPPORT_REWARD_RECOVERY',
  });
}

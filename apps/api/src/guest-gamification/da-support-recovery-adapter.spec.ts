import { ConflictException } from '@nestjs/common';
import {
  assertDaApplyConfirmation,
  DA_SUPPORT_RECOVERY,
  daSupportRequest,
  parseDaSupportMode,
  runDaSupportRecovery,
} from './da-support-recovery-adapter';

describe('DA support recovery adapter', () => {
  it('pins only the attested DA ticket, fact and Weekend rule', () => {
    expect(daSupportRequest()).toEqual({
      ticketNumber: 'LP-BUG-DA592E20',
      actions: [
        {
          factId: DA_SUPPORT_RECOVERY.factId,
          ruleKind: 'LOOT_BOX',
          ruleId: DA_SUPPORT_RECOVERY.ruleId,
        },
      ],
    });
  });
  it('accepts only explicit modes and digest-bound apply confirmation', () => {
    expect(parseDaSupportMode('preview')).toBe('preview');
    expect(() => parseDaSupportMode('all')).toThrow(ConflictException);
    expect(() =>
      assertDaApplyConfirmation('APPLY_DA_SUPPORT_RECOVERY stale', 'fresh'),
    ).toThrow(ConflictException);
    expect(() =>
      assertDaApplyConfirmation('APPLY_DA_SUPPORT_RECOVERY fresh', 'fresh'),
    ).not.toThrow();
  });
  it('uses real recovery interface previews for read-only reconcile and only applies with bound digest', async () => {
    const service = {
      previewSupportRewardRecovery: jest
        .fn()
        .mockResolvedValue({ mode: 'PREVIEW' }),
      applySupportRewardRecovery: jest
        .fn()
        .mockResolvedValue({ mode: 'APPLY' }),
    };
    await runDaSupportRecovery({ service, user: {}, mode: 'reconcile' });
    expect(service.previewSupportRewardRecovery).toHaveBeenCalledTimes(1);
    await runDaSupportRecovery({
      service,
      user: {},
      mode: 'apply',
      preview: {
        actionCount: 1,
        digest: 'fresh',
        allowedRuleIds: [DA_SUPPORT_RECOVERY.ruleId],
      },
      confirmation: 'APPLY_DA_SUPPORT_RECOVERY fresh',
    });
    expect(service.applySupportRewardRecovery).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        expectedDigest: 'fresh',
        confirmation: 'APPLY_SUPPORT_REWARD_RECOVERY',
      }),
    );
  });
});

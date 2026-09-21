import { ConflictException } from '@nestjs/common';
import {
  createLp571RecoveryAdapter,
  LP571,
} from './support-recovery-lp571-cli.adapter';

describe('LP571 recovery adapter', () => {
  const user = { id: 'platform', tenantId: 'tenant', isPlatformAdmin: true };
  it('pins canonical preview constants and never applies in preview', async () => {
    const replay = {
      previewBattlePass: jest
        .fn()
        .mockResolvedValue({ confirmationHash: 'digest' }),
      applyBattlePass: jest.fn(),
    };
    const adapter = createLp571RecoveryAdapter(replay, user);
    await adapter.preview();
    expect(replay.previewBattlePass).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        factId: LP571.factId,
        profileId: LP571.profileId,
        seasonId: LP571.seasonId,
        stepId: LP571.stepId,
        stepSequence: LP571.stepSequence,
        supportTicketNumber: LP571.ticketNumber,
      }),
    );
    expect(replay.applyBattlePass).not.toHaveBeenCalled();
  });
  it('refuses stale digest before apply', async () => {
    const replay = {
      previewBattlePass: jest
        .fn()
        .mockResolvedValue({ confirmationHash: 'fresh' }),
      applyBattlePass: jest.fn(),
    };
    await expect(
      createLp571RecoveryAdapter(replay, user).apply(
        'old',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(replay.applyBattlePass).not.toHaveBeenCalled();
  });
});

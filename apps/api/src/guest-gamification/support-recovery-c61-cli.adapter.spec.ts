/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  C61SupportRecoveryCliAdapter,
  C61_SUPPORT_CLI_FACT,
  C61_SUPPORT_CLI_RULE,
  C61_SUPPORT_CLI_TICKET,
} from './support-recovery-c61-cli.adapter';
const user: any = {
  id: 'u',
  tenantId: 't',
  isPlatformAdmin: true,
  platformTenantContext: true,
};
const plan = () => ({
  operation: 'C61_BUDGET_REFILL' as const,
  ticketNumber: C61_SUPPORT_CLI_TICKET,
  factId: C61_SUPPORT_CLI_FACT,
  ruleId: C61_SUPPORT_CLI_RULE,
});
describe('C61SupportRecoveryCliAdapter', () => {
  const old = process.env.LEETPLUS_SUPPORT_RECOVERY_CLI;
  afterEach(() => {
    if (old === undefined) delete process.env.LEETPLUS_SUPPORT_RECOVERY_CLI;
    else process.env.LEETPLUS_SUPPORT_RECOVERY_CLI = old;
  });
  it('is preview-only by default and rejects bad constants', async () => {
    process.env.LEETPLUS_SUPPORT_RECOVERY_CLI = '1';
    const service: any = {
      preview: jest.fn().mockResolvedValue({ mode: 'PREVIEW', digest: 'd' }),
      apply: jest.fn(),
    };
    const cli = new C61SupportRecoveryCliAdapter(service);
    await expect(cli.execute(user, plan())).resolves.toMatchObject({
      digest: 'd',
    });
    await expect(
      cli.execute(user, { ...plan(), factId: 'wrong' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(service.apply).not.toHaveBeenCalled();
  });
  it('requires switch and exact confirmation; reconcile is read-only', async () => {
    const service: any = {
      preview: jest
        .fn()
        .mockResolvedValue({ mode: 'PREVIEW', digest: 'd', outcome: 'READY' }),
      apply: jest.fn().mockResolvedValue({ mode: 'APPLY', digest: 'd' }),
    };
    const cli = new C61SupportRecoveryCliAdapter(service);
    await expect(cli.execute(user, plan())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    process.env.LEETPLUS_SUPPORT_RECOVERY_CLI = '1';
    await expect(
      cli.execute(user, { ...plan(), mode: 'reconcile' }),
    ).resolves.toMatchObject({ mode: 'PREVIEW' });
    await expect(
      cli.execute(user, {
        ...plan(),
        mode: 'apply',
        digest: 'd',
        confirmation: 'bad',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      cli.execute(user, {
        ...plan(),
        mode: 'apply',
        digest: 'd',
        confirmation: 'APPLY_C61_SUPPORT_RECOVERY d',
      }),
    ).resolves.toMatchObject({ mode: 'APPLY' });
  });
});

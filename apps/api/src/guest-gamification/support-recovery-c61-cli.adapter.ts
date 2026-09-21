import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  C61BudgetRefillExceptionService,
  type C61BudgetRefillPreview,
} from './c61-budget-refill-exception.service';

export const C61_SUPPORT_CLI_TICKET = 'LP-BUG-C61EE785';
export const C61_SUPPORT_CLI_FACT = 'c68b1912-9a94-46c7-948c-47c1e3738bee';
export const C61_SUPPORT_CLI_RULE = '0ce6f7e3-99ea-4aa2-b6e2-68e8dbd1bb12';

export type C61SupportCliPlan = Readonly<{
  operation: 'C61_BUDGET_REFILL';
  ticketNumber: typeof C61_SUPPORT_CLI_TICKET;
  factId: typeof C61_SUPPORT_CLI_FACT;
  ruleId: typeof C61_SUPPORT_CLI_RULE;
  mode?: 'preview' | 'apply' | 'reconcile';
  digest?: string;
  confirmation?: string;
}>;

/** Sealed adapter for an in-container CLI; it never creates HTTP/JWT identity. */
export class C61SupportRecoveryCliAdapter {
  constructor(private readonly service: C61BudgetRefillExceptionService) {}

  async execute(
    user: AuthenticatedUser,
    plan: C61SupportCliPlan,
  ): Promise<C61BudgetRefillPreview> {
    if (process.env.LEETPLUS_SUPPORT_RECOVERY_CLI !== '1') {
      throw new ForbiddenException('LEETPLUS_SUPPORT_RECOVERY_CLI=1 required.');
    }
    if (
      plan.operation !== 'C61_BUDGET_REFILL' ||
      plan.ticketNumber !== C61_SUPPORT_CLI_TICKET ||
      plan.factId !== C61_SUPPORT_CLI_FACT ||
      plan.ruleId !== C61_SUPPORT_CLI_RULE
    ) {
      throw new ConflictException('Exact C61 support CLI plan mismatch.');
    }
    const preview = await this.service.preview(user);
    if ((plan.mode ?? 'preview') === 'preview') return preview;
    if (plan.mode === 'reconcile') return preview;
    if (
      plan.digest !== preview.digest ||
      plan.confirmation !== `APPLY_C61_SUPPORT_RECOVERY ${preview.digest}`
    ) {
      throw new ConflictException(
        'Exact C61 CLI digest confirmation is required.',
      );
    }
    return this.service.apply(user, {
      expectedDigest: preview.digest,
      confirmation: 'APPLY_C61_BUDGET_REFILL_EXCEPTION',
    });
  }
}

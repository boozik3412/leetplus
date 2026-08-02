import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { STRICT_ROLES_KEY } from '../auth/strict-roles.decorator';
import { StrictRolesGuard } from '../auth/strict-roles.guard';
import { GuestGamificationController } from './guest-gamification.controller';

type StrictOwnerAdminHandlerName =
  | 'runRewardMaterializer'
  | 'previewBattlePassRuleReplay'
  | 'applyBattlePassRuleReplay'
  | 'previewExactPlayTimeCanonicalization'
  | 'applyExactPlayTimeCanonicalization'
  | 'previewLootBoxEntitlementReconciliation'
  | 'applyLootBoxEntitlementReconciliation'
  | 'previewLootBoxEntitlementOverLimitRepair'
  | 'applyLootBoxEntitlementOverLimitRepair';

type LedgerHandlerName =
  | 'queueBonusLedger'
  | 'dispatchBonusLedger'
  | 'cancelBonusLedgerEntry';

const strictOwnerAdminHandlerNames: StrictOwnerAdminHandlerName[] = [
  'runRewardMaterializer',
  'previewBattlePassRuleReplay',
  'applyBattlePassRuleReplay',
  'previewExactPlayTimeCanonicalization',
  'applyExactPlayTimeCanonicalization',
  'previewLootBoxEntitlementReconciliation',
  'applyLootBoxEntitlementReconciliation',
  'previewLootBoxEntitlementOverLimitRepair',
  'applyLootBoxEntitlementOverLimitRepair',
];

const ledgerHandlerNames: LedgerHandlerName[] = [
  'queueBonusLedger',
  'dispatchBonusLedger',
  'cancelBonusLedgerEntry',
];

function strictOwnerAdminContext(
  methodName: StrictOwnerAdminHandlerName,
  role: UserRole,
): ExecutionContext {
  return {
    getHandler: () => GuestGamificationController.prototype[methodName],
    getClass: () => GuestGamificationController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          role,
          permissions: ['manage_guest_game_rules'],
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

function ledgerContext(
  methodName: LedgerHandlerName,
  role: UserRole,
): ExecutionContext {
  return {
    getHandler: () => GuestGamificationController.prototype[methodName],
    getClass: () => GuestGamificationController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          role,
          customRoleId: 'custom-role',
          hasRoleOverride: true,
          permissions: ['operate_guest_game_ledger'],
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('GuestGamificationController strict OWNER/ADMIN authorization', () => {
  const guard = new StrictRolesGuard(new Reflector());

  it.each(strictOwnerAdminHandlerNames)(
    'protects %s with exact OWNER/ADMIN roles',
    (methodName) => {
      const handler = GuestGamificationController.prototype[methodName];

      expect(Reflect.getMetadata(STRICT_ROLES_KEY, handler)).toEqual([
        UserRole.OWNER,
        UserRole.ADMIN,
      ]);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        StrictRolesGuard,
      );
    },
  );

  it.each(strictOwnerAdminHandlerNames)(
    'allows OWNER and ADMIN on %s',
    (methodName) => {
      expect(
        guard.canActivate(strictOwnerAdminContext(methodName, UserRole.OWNER)),
      ).toBe(true);
      expect(
        guard.canActivate(strictOwnerAdminContext(methodName, UserRole.ADMIN)),
      ).toBe(true);
    },
  );

  it.each(strictOwnerAdminHandlerNames)(
    'denies a capability-enabled non-owner on %s',
    (methodName) => {
      expect(() =>
        guard.canActivate(
          strictOwnerAdminContext(methodName, UserRole.MARKETER),
        ),
      ).toThrow(ForbiddenException);
    },
  );
});

describe('GuestGamificationController bonus ledger authorization', () => {
  const guard = new StrictRolesGuard(new Reflector());

  it.each(ledgerHandlerNames)(
    'protects %s with an OWNER/ADMIN/MANAGER hard ceiling',
    (methodName) => {
      const handler = GuestGamificationController.prototype[methodName];

      expect(Reflect.getMetadata(STRICT_ROLES_KEY, handler)).toEqual([
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.MANAGER,
      ]);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        StrictRolesGuard,
      );
    },
  );

  it.each(ledgerHandlerNames)(
    'denies custom or overridden lower roles on %s despite ledger capability',
    (methodName) => {
      expect(() =>
        guard.canActivate(
          ledgerContext(methodName, UserRole.CLUB_ADMINISTRATOR),
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        guard.canActivate(ledgerContext(methodName, UserRole.MARKETER)),
      ).toThrow(ForbiddenException);
    },
  );
});

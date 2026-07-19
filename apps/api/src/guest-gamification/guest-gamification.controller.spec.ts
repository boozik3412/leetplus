import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { STRICT_ROLES_KEY } from '../auth/strict-roles.decorator';
import { StrictRolesGuard } from '../auth/strict-roles.guard';
import { GuestGamificationController } from './guest-gamification.controller';

type ReplayHandlerName =
  | 'previewBattlePassRuleReplay'
  | 'applyBattlePassRuleReplay'
  | 'previewExactPlayTimeCanonicalization'
  | 'applyExactPlayTimeCanonicalization';

const replayHandlerNames: ReplayHandlerName[] = [
  'previewBattlePassRuleReplay',
  'applyBattlePassRuleReplay',
  'previewExactPlayTimeCanonicalization',
  'applyExactPlayTimeCanonicalization',
];

function replayContext(
  methodName: ReplayHandlerName,
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

describe('GuestGamificationController replay authorization', () => {
  const guard = new StrictRolesGuard(new Reflector());

  it.each(replayHandlerNames)(
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

  it.each(replayHandlerNames)('allows OWNER and ADMIN on %s', (methodName) => {
    expect(guard.canActivate(replayContext(methodName, UserRole.OWNER))).toBe(
      true,
    );
    expect(guard.canActivate(replayContext(methodName, UserRole.ADMIN))).toBe(
      true,
    );
  });

  it.each(replayHandlerNames)(
    'denies a capability-enabled non-owner on %s',
    (methodName) => {
      expect(() =>
        guard.canActivate(replayContext(methodName, UserRole.MARKETER)),
      ).toThrow(ForbiddenException);
    },
  );
});

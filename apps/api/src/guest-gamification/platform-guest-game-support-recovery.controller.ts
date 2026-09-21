import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import {
  GuestGameRuleReplayService,
  type GuestGameSupportRewardRecoveryApplyDto,
  type GuestGameSupportRewardRecoveryPreviewDto,
  type GuestGameSupportRewardRecoveryResult,
} from './guest-game-rule-replay.service';
import {
  C61BudgetRefillExceptionService,
  type C61BudgetRefillPreview,
} from './c61-budget-refill-exception.service';

@Controller('admin/guest-gamification/support-reward-recovery')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformGuestGameSupportRecoveryController {
  constructor(
    private readonly replayService: GuestGameRuleReplayService,
    private readonly c61Exception: C61BudgetRefillExceptionService,
  ) {}

  @Post('c61-budget-refill/preview')
  previewC61(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<C61BudgetRefillPreview> {
    return this.c61Exception.preview(user);
  }

  @Post('c61-budget-refill/apply')
  applyC61(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { expectedDigest?: string; confirmation?: string },
  ): Promise<C61BudgetRefillPreview> {
    return this.c61Exception.apply(user, dto);
  }

  @Post('preview')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameSupportRewardRecoveryPreviewDto,
  ): Promise<GuestGameSupportRewardRecoveryResult> {
    return this.replayService.previewSupportRewardRecovery(user, dto);
  }

  @Post('apply')
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameSupportRewardRecoveryApplyDto,
  ): Promise<GuestGameSupportRewardRecoveryResult> {
    return this.replayService.applySupportRewardRecovery(user, dto);
  }
}

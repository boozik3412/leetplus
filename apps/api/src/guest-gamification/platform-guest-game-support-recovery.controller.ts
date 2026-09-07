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

@Controller('admin/guest-gamification/support-reward-recovery')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformGuestGameSupportRecoveryController {
  constructor(private readonly replayService: GuestGameRuleReplayService) {}

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

import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type GuestPortalAppOpenResponse,
  type GuestPortalCheckInResponse,
  type GuestPortalClubSelectResponse,
  type GuestPortalCommunicationPreferenceResponse,
  type GuestPortalCompletionNotificationAcknowledgeResponse,
  type GuestPortalGamificationClubDirectory,
  type GuestPortalGameMissionPage,
  type GuestPortalGameSummary,
  type GuestPortalIncomingCallLast4StartResponse,
  type GuestPortalIncomingCallLast4VerifyResponse,
  type GuestPortalLangameDetailsResponse,
  type GuestPortalLootBoxOpenResponse,
  type GuestPortalMessengerUpdateResponse,
  GuestPortalService,
  type GuestPortalLangameMatchResponse,
  type GuestPortalOtpStartResponse,
  type GuestPortalOtpVerifyResponse,
  type GuestPortalPayload,
  type GuestPortalProfileUpdateResponse,
  type GuestPortalPublicConfig,
  type GuestPortalTelegramAuthStartResponse,
  type GuestPortalTelegramAuthStatusResponse,
  type GuestPortalTelegramLinkConfirmResponse,
  type GuestPortalTelegramLinkStartResponse,
  type GuestPortalTelegramMiniAppSessionResponse,
  type GuestPortalTelegramWebhookResponse,
  type GuestPortalUserCallAuthStartResponse,
  type GuestPortalUserCallAuthStatusResponse,
  type GuestPortalUserCallConfirmResponse,
} from './guest-portal.service';
import {
  GUEST_BUG_REPORT_MAX_BYTES,
  type GuestBugReportInput,
  type GuestBugReportResponse,
  type GuestBugReportUploadFile,
} from './guest-support.service';

@Controller('guest-portal')
export class GuestPortalController {
  constructor(private readonly guestPortalService: GuestPortalService) {}

  @Get('gamification/clubs')
  getGamificationClubDirectory(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
  ): Promise<GuestPortalGamificationClubDirectory> {
    return this.guestPortalService.getGamificationClubDirectory({
      lat,
      lng,
      radiusKm,
    });
  }

  @Get(':tenantSlug/:storeId/public-config')
  getPublicConfig(
    @Param('tenantSlug') tenantSlug: string,
    @Param('storeId') storeId: string,
  ): Promise<GuestPortalPublicConfig> {
    return this.guestPortalService.getPublicConfig(tenantSlug, storeId);
  }

  @Post(':tenantSlug/:storeId/otp/start')
  startOtp(
    @Param('tenantSlug') tenantSlug: string,
    @Param('storeId') storeId: string,
    @Body() dto: { phone?: unknown; gameConsentAccepted?: unknown },
  ): Promise<GuestPortalOtpStartResponse> {
    return this.guestPortalService.startOtp(tenantSlug, storeId, dto);
  }

  @Post(':tenantSlug/:storeId/otp/verify')
  verifyOtp(
    @Param('tenantSlug') tenantSlug: string,
    @Param('storeId') storeId: string,
    @Body()
    dto: { challengeId?: unknown; code?: unknown; referralCode?: unknown },
  ): Promise<GuestPortalOtpVerifyResponse> {
    return this.guestPortalService.verifyOtp(tenantSlug, storeId, dto);
  }

  @Post(':tenantSlug/:storeId/user-call-auth/start')
  startUserCallAuth(
    @Param('tenantSlug') tenantSlug: string,
    @Param('storeId') storeId: string,
    @Body() dto: { phone?: unknown; gameConsentAccepted?: unknown },
  ): Promise<GuestPortalUserCallAuthStartResponse> {
    return this.guestPortalService.startUserCallAuth(tenantSlug, storeId, dto);
  }

  @Post(':tenantSlug/:storeId/user-call-auth/status')
  getUserCallAuthStatus(
    @Param('tenantSlug') tenantSlug: string,
    @Param('storeId') storeId: string,
    @Body() dto: { challengeId?: unknown; referralCode?: unknown },
  ): Promise<GuestPortalUserCallAuthStatusResponse> {
    return this.guestPortalService.getUserCallAuthStatus(
      tenantSlug,
      storeId,
      dto,
    );
  }

  @Post(':tenantSlug/:storeId/incoming-call-last4/start')
  startIncomingCallLast4Auth(
    @Param('tenantSlug') tenantSlug: string,
    @Param('storeId') storeId: string,
    @Body() dto: { phone?: unknown; gameConsentAccepted?: unknown },
  ): Promise<GuestPortalIncomingCallLast4StartResponse> {
    return this.guestPortalService.startIncomingCallLast4Auth(
      tenantSlug,
      storeId,
      dto,
    );
  }

  @Post(':tenantSlug/:storeId/incoming-call-last4/verify')
  verifyIncomingCallLast4Auth(
    @Param('tenantSlug') tenantSlug: string,
    @Param('storeId') storeId: string,
    @Body()
    dto: { challengeId?: unknown; code?: unknown; referralCode?: unknown },
  ): Promise<GuestPortalIncomingCallLast4VerifyResponse> {
    return this.guestPortalService.verifyIncomingCallLast4Auth(
      tenantSlug,
      storeId,
      dto,
    );
  }

  @Post(':tenantSlug/:storeId/telegram-auth/start')
  startTelegramAuth(
    @Param('tenantSlug') tenantSlug: string,
    @Param('storeId') storeId: string,
    @Body() dto: { gameConsentAccepted?: unknown },
  ): Promise<GuestPortalTelegramAuthStartResponse> {
    return this.guestPortalService.startTelegramAuth(tenantSlug, storeId, dto);
  }

  @Post(':tenantSlug/:storeId/telegram-auth/status')
  getTelegramAuthStatus(
    @Param('tenantSlug') tenantSlug: string,
    @Param('storeId') storeId: string,
    @Body() dto: { challengeId?: unknown; referralCode?: unknown },
  ): Promise<GuestPortalTelegramAuthStatusResponse> {
    return this.guestPortalService.getTelegramAuthStatus(
      tenantSlug,
      storeId,
      dto,
    );
  }

  @Get('session')
  getSession(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<GuestPortalPayload> {
    return this.guestPortalService.getSession(authorization);
  }

  @Get('session/game-summary')
  getGameSummary(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<GuestPortalGameSummary> {
    return this.guestPortalService.getGameSummary(authorization);
  }

  @Get('session/game-missions')
  getGameMissions(
    @Headers('authorization') authorization: string | undefined,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ): Promise<GuestPortalGameMissionPage> {
    return this.guestPortalService.getGameMissions(authorization, {
      offset,
      limit,
    });
  }

  @Post('session/app-open')
  recordAppOpen(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: { surface?: unknown },
  ): Promise<GuestPortalAppOpenResponse> {
    return this.guestPortalService.recordAppOpen(authorization, dto);
  }

  @Post('session/support/bug-reports')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: GUEST_BUG_REPORT_MAX_BYTES,
        files: 1,
        fields: 5,
        fieldSize: 4 * 1024,
        parts: 6,
      },
    }),
  )
  createBugReport(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-client-user-agent') userAgent: string | undefined,
    @Body() dto: GuestBugReportInput,
    @UploadedFile() file?: GuestBugReportUploadFile,
  ): Promise<GuestBugReportResponse> {
    return this.guestPortalService.createBugReport(
      authorization,
      idempotencyKey,
      userAgent,
      dto,
      file,
    );
  }

  @Post('session/completion-notifications/:notificationId/acknowledge')
  acknowledgeCompletionNotification(
    @Headers('authorization') authorization: string | undefined,
    @Param('notificationId') notificationId: string,
  ): Promise<GuestPortalCompletionNotificationAcknowledgeResponse> {
    return this.guestPortalService.acknowledgeCompletionNotification(
      authorization,
      notificationId,
    );
  }

  @Post('session/reward-wallet/claim-all')
  claimAllRewardWalletItems(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<GuestPortalGameSummary> {
    return this.guestPortalService.claimAllRewardWalletItems(authorization);
  }

  @Post('session/reward-wallet/items/:walletItemId/claim')
  claimRewardWalletItem(
    @Headers('authorization') authorization: string | undefined,
    @Param('walletItemId') walletItemId: string,
  ): Promise<GuestPortalGameSummary> {
    return this.guestPortalService.claimRewardWalletItem(
      authorization,
      walletItemId,
    );
  }

  @Post('session/reward-wallet/items/:walletItemId/open')
  openRewardWalletLootBoxItem(
    @Headers('authorization') authorization: string | undefined,
    @Param('walletItemId') walletItemId: string,
  ): Promise<GuestPortalLootBoxOpenResponse> {
    return this.guestPortalService.openRewardWalletLootBoxItem(
      authorization,
      walletItemId,
    );
  }

  @Post('session/profile')
  updateProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: { displayName?: unknown },
  ): Promise<GuestPortalProfileUpdateResponse> {
    return this.guestPortalService.updateProfile(authorization, dto);
  }

  @Post('session/loot-boxes/:lootBoxId/open')
  openLootBox(
    @Headers('authorization') authorization: string | undefined,
    @Param('lootBoxId') lootBoxId: string,
  ): Promise<GuestPortalLootBoxOpenResponse> {
    return this.guestPortalService.openLootBox(authorization, lootBoxId);
  }

  @Post('session/select-club')
  selectGameClub(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: { clubId?: unknown; tenantSlug?: unknown; storeId?: unknown },
  ): Promise<GuestPortalClubSelectResponse> {
    return this.guestPortalService.selectGameClub(authorization, dto);
  }

  @Post('telegram-mini-app/session')
  exchangeTelegramMiniAppSession(
    @Headers('x-guest-game-telegram-edge-secret')
    edgeSecret: string | undefined,
    @Body()
    dto: {
      initData?: unknown;
      telegramUserId?: unknown;
      authDate?: unknown;
      clubId?: unknown;
      tenantSlug?: unknown;
      storeId?: unknown;
    },
  ): Promise<GuestPortalTelegramMiniAppSessionResponse> {
    return this.guestPortalService.exchangeTelegramMiniAppSession({
      ...dto,
      edgeSecret,
    });
  }

  @Post('session/check-in')
  checkIn(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: { note?: unknown },
  ): Promise<GuestPortalCheckInResponse> {
    return this.guestPortalService.checkIn(authorization, dto);
  }

  @Post('session/langame-match')
  matchLangameGuest(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: { phone?: unknown },
  ): Promise<GuestPortalLangameMatchResponse> {
    return this.guestPortalService.matchLangameGuest(authorization, dto);
  }

  @Post('session/langame-details')
  getLangameGuestDetails(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<GuestPortalLangameDetailsResponse> {
    return this.guestPortalService.getLangameGuestDetails(authorization);
  }

  @Post('session/communications/preferences')
  updateCommunicationPreferences(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: { action?: unknown },
  ): Promise<GuestPortalCommunicationPreferenceResponse> {
    return this.guestPortalService.updateCommunicationPreferences(
      authorization,
      dto,
    );
  }

  @Post('session/communications/messenger')
  updateMessengerChannel(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: { channel?: unknown; identity?: unknown },
  ): Promise<GuestPortalMessengerUpdateResponse> {
    return this.guestPortalService.updateMessengerChannel(authorization, dto);
  }

  @Post('session/communications/telegram-link/start')
  startTelegramLink(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<GuestPortalTelegramLinkStartResponse> {
    return this.guestPortalService.startTelegramLink(authorization);
  }

  @Post('telegram/link/confirm')
  confirmTelegramLink(
    @Headers('x-guest-game-telegram-secret') secret: string | undefined,
    @Body()
    dto: {
      code?: unknown;
      telegramChatId?: unknown;
      telegramUsername?: unknown;
    },
  ): Promise<GuestPortalTelegramLinkConfirmResponse> {
    return this.guestPortalService.confirmTelegramLink(secret, dto);
  }

  @Post('user-call/confirm')
  confirmUserCallAuth(
    @Headers('x-guest-portal-user-call-secret') secret: string | undefined,
    @Body()
    dto: {
      challengeId?: unknown;
      callerPhone?: unknown;
    },
  ): Promise<GuestPortalUserCallConfirmResponse> {
    return this.guestPortalService.confirmUserCallAuth(secret, dto);
  }

  @Post('telegram/webhook')
  handleTelegramWebhook(
    @Headers('x-telegram-bot-api-secret-token')
    telegramSecret: string | undefined,
    @Headers('x-guest-game-telegram-secret') linkSecret: string | undefined,
    @Body() dto: unknown,
  ): Promise<GuestPortalTelegramWebhookResponse> {
    return this.guestPortalService.handleTelegramWebhook(
      telegramSecret ?? linkSecret,
      dto,
    );
  }
}

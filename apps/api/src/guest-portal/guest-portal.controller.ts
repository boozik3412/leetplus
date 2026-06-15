import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  type GuestPortalCheckInResponse,
  type GuestPortalCommunicationPreferenceResponse,
  type GuestPortalGamificationClubDirectory,
  type GuestPortalLangameDetailsResponse,
  type GuestPortalMessengerUpdateResponse,
  GuestPortalService,
  type GuestPortalLangameMatchResponse,
  type GuestPortalOtpStartResponse,
  type GuestPortalOtpVerifyResponse,
  type GuestPortalPayload,
  type GuestPortalPublicConfig,
  type GuestPortalTelegramLinkConfirmResponse,
  type GuestPortalTelegramLinkStartResponse,
  type GuestPortalTelegramWebhookResponse,
} from './guest-portal.service';

@Controller('guest-portal')
export class GuestPortalController {
  constructor(private readonly guestPortalService: GuestPortalService) {}

  @Get('gamification/clubs')
  getGamificationClubDirectory(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ): Promise<GuestPortalGamificationClubDirectory> {
    return this.guestPortalService.getGamificationClubDirectory({ lat, lng });
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
    @Body() dto: { challengeId?: unknown; code?: unknown },
  ): Promise<GuestPortalOtpVerifyResponse> {
    return this.guestPortalService.verifyOtp(tenantSlug, storeId, dto);
  }

  @Get('session')
  getSession(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<GuestPortalPayload> {
    return this.guestPortalService.getSession(authorization);
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

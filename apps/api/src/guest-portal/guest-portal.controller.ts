import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import {
  GuestPortalService,
  type GuestPortalOtpStartResponse,
  type GuestPortalOtpVerifyResponse,
  type GuestPortalPayload,
  type GuestPortalPublicConfig,
} from './guest-portal.service';

@Controller('guest-portal')
export class GuestPortalController {
  constructor(private readonly guestPortalService: GuestPortalService) {}

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
    @Body() dto: { phone?: unknown },
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
}

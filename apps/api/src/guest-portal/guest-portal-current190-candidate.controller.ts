import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  GuestPortalCurrent190ApplicationBoundary,
  type GuestPortalCurrent190LogoutResponse,
} from './guest-portal-current190-application-boundary';

/**
 * Dormant CURRENT190 HTTP adapter.
 *
 * Having a Nest controller decorator makes the intended transport contract
 * testable, but this class is deliberately absent from every production
 * module. Importing or registering it requires a separate promotion review.
 */
@Controller('guest-portal/session')
export class GuestPortalCurrent190CandidateController {
  constructor(
    private readonly application: GuestPortalCurrent190ApplicationBoundary,
  ) {}

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') requestId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<GuestPortalCurrent190LogoutResponse> {
    this.setPrivateHeaders(response);
    return this.application.logout(authorization, requestId ?? '');
  }

  @Get('media/:id')
  async readMedia(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') assetId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    this.setPrivateHeaders(response);
    const asset = await this.application.readMedia(authorization, assetId);
    return new StreamableFile(asset.buffer, {
      type: asset.contentType,
      disposition: 'inline',
      length: asset.byteLength,
    });
  }

  private setPrivateHeaders(response: Response): void {
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    response.setHeader('Vary', 'Authorization, Cookie, Idempotency-Key');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  }
}

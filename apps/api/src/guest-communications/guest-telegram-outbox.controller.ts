import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { assertScheduledHttpAllowed } from '../config/design-partner-runtime-policy';
import {
  GuestTelegramOutboxService,
  type GuestTelegramOutboxClaimDto,
  type GuestTelegramOutboxClaimResult,
  type GuestTelegramOutboxReportDto,
  type GuestTelegramOutboxReportResult,
} from './guest-telegram-outbox.service';

// Worker endpoints of the guest Telegram outbox. Only the bot poller on the
// Telegram edge calls them, with its own token (not the sync service token
// and not the Telegram webhook secret).
@Controller('guests/communications/telegram-outbox')
export class GuestTelegramOutboxController {
  constructor(
    private readonly configService: ConfigService,
    private readonly outbox: GuestTelegramOutboxService,
  ) {}

  @Post('claim')
  claim(
    @Headers('x-telegram-outbox-token') token: string | undefined,
    @Body() dto: GuestTelegramOutboxClaimDto,
  ): Promise<GuestTelegramOutboxClaimResult> {
    this.assertToken(token);
    return this.outbox.claim(dto ?? {});
  }

  @Post('report')
  report(
    @Headers('x-telegram-outbox-token') token: string | undefined,
    @Body() dto: GuestTelegramOutboxReportDto,
  ): Promise<GuestTelegramOutboxReportResult> {
    this.assertToken(token);
    return this.outbox.report(dto ?? {});
  }

  private assertToken(token: string | undefined) {
    assertScheduledHttpAllowed(this.configService);
    const expected = this.configService
      .get<string>('GUEST_TELEGRAM_OUTBOX_TOKEN')
      ?.trim();
    if (!expected || expected.length < 32) {
      throw new UnauthorizedException(
        'GUEST_TELEGRAM_OUTBOX_TOKEN is not configured',
      );
    }
    if (!token || !sameSecret(token, expected)) {
      throw new UnauthorizedException('Invalid Telegram outbox token');
    }
  }
}

function sameSecret(actual: string, expected: string) {
  const a = createHash('sha256').update(actual).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

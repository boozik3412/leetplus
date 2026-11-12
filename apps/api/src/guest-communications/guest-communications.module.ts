import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { GuestTelegramCampaignService } from './guest-telegram-campaign.service';
import { GuestTelegramOutboxController } from './guest-telegram-outbox.controller';
import { GuestTelegramOutboxService } from './guest-telegram-outbox.service';
import { MarketingCampaignTelegramController } from './marketing-campaign-telegram.controller';
import { GuestVisitRatingService } from './guest-visit-rating.service';
import { MarketingVisitRatingController } from './marketing-visit-rating.controller';

// Corporate/worker side of guest communications through the guest Telegram
// bot: the outbox worker endpoints, campaign broadcasts and the visit rating
// report from the cabinet.
// Not part of the public guest runtime.
@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [
    GuestTelegramOutboxController,
    MarketingCampaignTelegramController,
    MarketingVisitRatingController,
  ],
  providers: [
    GuestTelegramOutboxService,
    GuestTelegramCampaignService,
    GuestVisitRatingService,
  ],
  exports: [GuestTelegramOutboxService],
})
export class GuestCommunicationsModule {}

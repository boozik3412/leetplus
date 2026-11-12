import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { GuestTelegramOutboxController } from './guest-telegram-outbox.controller';
import { GuestTelegramOutboxService } from './guest-telegram-outbox.service';

// Corporate/worker side of guest communications through the guest Telegram
// bot. Not part of the public guest runtime.
@Module({
  imports: [PrismaModule, TenancyModule],
  controllers: [GuestTelegramOutboxController],
  providers: [GuestTelegramOutboxService],
  exports: [GuestTelegramOutboxService],
})
export class GuestCommunicationsModule {}

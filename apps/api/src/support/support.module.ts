import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PlatformSupportTicketsController } from './platform-support-tickets.controller';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';

@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [SupportTicketsController, PlatformSupportTicketsController],
  providers: [SupportTicketsService],
})
export class SupportModule {}

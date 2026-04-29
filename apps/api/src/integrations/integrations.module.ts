import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { LangameClient } from './langame.client';
import { LangameController } from './langame.controller';
import { LangameSyncService } from './langame-sync.service';

@Module({
  imports: [PrismaModule, TenancyModule],
  controllers: [LangameController],
  providers: [LangameClient, LangameSyncService],
  exports: [LangameSyncService],
})
export class IntegrationsModule {}

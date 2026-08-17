import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { FounderOperatorBetaActivationDatabaseService } from './founder-operator-beta-activation.database';
import { FounderOperatorBetaActivationService } from './founder-operator-beta-activation.service';
import { FounderOperatorBetaGoService } from './founder-operator-beta-go.service';
import { SharedTenantProvisioningService } from './shared-tenant-provisioning.service';

@Module({
  imports: [AuthModule, IntegrationsModule, PrismaModule, TenancyModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    SharedTenantProvisioningService,
    FounderOperatorBetaGoService,
    FounderOperatorBetaActivationDatabaseService,
    FounderOperatorBetaActivationService,
  ],
})
export class AdminModule {}

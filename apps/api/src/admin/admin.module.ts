import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SharedTenantProvisioningService } from './shared-tenant-provisioning.service';

@Module({
  imports: [AuthModule, IntegrationsModule, PrismaModule, TenancyModule],
  controllers: [AdminController],
  providers: [AdminService, SharedTenantProvisioningService],
})
export class AdminModule {}

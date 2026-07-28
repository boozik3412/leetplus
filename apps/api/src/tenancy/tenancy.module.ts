import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessScopeService } from './access-scope.service';
import { TenantEntitlementProfileService } from './tenant-entitlement-profile.service';
import { TenantContextService } from './tenant-context.service';
import { TenantExecutionPolicyService } from './tenant-execution-policy.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    AccessScopeService,
    TenantContextService,
    TenantEntitlementProfileService,
    TenantExecutionPolicyService,
  ],
  exports: [
    AccessScopeService,
    TenantContextService,
    TenantEntitlementProfileService,
    TenantExecutionPolicyService,
  ],
})
export class TenancyModule {}

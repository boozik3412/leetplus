import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessScopeService } from './access-scope.service';
import { TenantEntitlementProfileService } from './tenant-entitlement-profile.service';
import { TenantContextService } from './tenant-context.service';
import { TenantExecutionAdmissionService } from './tenant-execution-admission.service';
import { TenantExecutionPolicyService } from './tenant-execution-policy.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    AccessScopeService,
    TenantContextService,
    TenantEntitlementProfileService,
    TenantExecutionAdmissionService,
    TenantExecutionPolicyService,
  ],
  exports: [
    AccessScopeService,
    TenantContextService,
    TenantEntitlementProfileService,
    TenantExecutionAdmissionService,
    TenantExecutionPolicyService,
  ],
})
export class TenancyModule {}

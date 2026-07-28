import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { TenantEntitlementProfileService } from '../tenancy/tenant-entitlement-profile.service';
import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';
import type { SharedTenantProvisioningService } from './shared-tenant-provisioning.service';

describe('AdminController shared beta provisioning boundary', () => {
  it('keeps the legacy raw-URL provisioning candidate unreachable', () => {
    const sharedTenantProvisioningService = {
      provision: jest.fn(),
    };
    const controller = new AdminController(
      {} as AdminService,
      {} as TenantEntitlementProfileService,
      sharedTenantProvisioningService as unknown as SharedTenantProvisioningService,
    );

    const user = {
      id: 'platform-admin',
      isPlatformAdmin: true,
    } as AuthenticatedUser;

    try {
      controller.provisionSharedBetaTenant(user, {});
      throw new Error('Expected provisioning boundary to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(
        (error as ServiceUnavailableException).getResponse(),
      ).toMatchObject({
        reasonCode: 'SHARED_BETA_PROVISIONING_IDENTITY_WORKFLOW_PENDING',
      });
    }
    expect(sharedTenantProvisioningService.provision).not.toHaveBeenCalled();
  });
});

import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { TenantEntitlementProfileService } from '../tenancy/tenant-entitlement-profile.service';
import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';
import type { SharedTenantProvisioningService } from './shared-tenant-provisioning.service';

describe('AdminController shared beta provisioning boundary', () => {
  function controller() {
    const sharedTenantProvisioningService = {
      provision: jest.fn(),
      activateInitialOwner: jest.fn(),
      revokeInitialOwnerInvite: jest.fn(),
    };
    return {
      controller: new AdminController(
        {} as AdminService,
        {} as TenantEntitlementProfileService,
        sharedTenantProvisioningService as unknown as SharedTenantProvisioningService,
      ),
      sharedTenantProvisioningService,
    };
  }

  it('keeps shell provisioning unreachable before protected activation', () => {
    const { controller: adminController, sharedTenantProvisioningService } =
      controller();

    const user = {
      id: 'platform-admin',
      isPlatformAdmin: true,
    } as AuthenticatedUser;

    try {
      adminController.provisionSharedBetaTenant(user, {});
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

  it('keeps the protected activation coordinator dormant', () => {
    const { controller: adminController, sharedTenantProvisioningService } =
      controller();
    const user = {
      id: 'platform-admin',
      isPlatformAdmin: true,
    } as AuthenticatedUser;

    try {
      adminController.activateSharedBetaInitialOwner(user, 'tenant-id', {});
      throw new Error('Expected activation boundary to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(
        (error as ServiceUnavailableException).getResponse(),
      ).toMatchObject({
        reasonCode: 'SHARED_BETA_INITIAL_OWNER_COORDINATOR_DORMANT',
      });
    }
    expect(
      sharedTenantProvisioningService.activateInitialOwner,
    ).not.toHaveBeenCalled();
  });

  it('keeps the legacy initial-owner revoke route fail-closed', () => {
    const { controller: adminController, sharedTenantProvisioningService } =
      controller();
    const user = {
      id: 'platform-admin',
      isPlatformAdmin: true,
    } as AuthenticatedUser;

    try {
      adminController.revokeSharedBetaInitialOwnerInvite(user, 'tenant-id', {});
      throw new Error('Expected revoke boundary to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(
        (error as ServiceUnavailableException).getResponse(),
      ).toMatchObject({
        reasonCode: 'SHARED_BETA_OWNER_INVITE_WORKFLOW_PENDING',
      });
    }
    expect(
      sharedTenantProvisioningService.revokeInitialOwnerInvite,
    ).not.toHaveBeenCalled();
  });
});

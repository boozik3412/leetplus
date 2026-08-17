import { ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { TenantEntitlementProfileService } from '../tenancy/tenant-entitlement-profile.service';
import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';
import type { FounderOperatorBetaActivationService } from './founder-operator-beta-activation.service';
import type { FounderOperatorBetaGoService } from './founder-operator-beta-go.service';
import type { SharedTenantProvisioningService } from './shared-tenant-provisioning.service';

describe('AdminController shared beta provisioning boundary', () => {
  function controller() {
    const sharedTenantProvisioningService = {
      provision: jest.fn(),
      activateInitialOwner: jest.fn(),
      revokeInitialOwnerInvite: jest.fn(),
    };
    const founderOperatorBetaGoService = {
      assertPreparationEnabled: jest.fn(),
      issue: jest.fn(),
      revoke: jest.fn(),
    };
    const founderOperatorBetaActivationService = {
      activate: jest.fn(),
    };
    return {
      controller: new AdminController(
        {} as AdminService,
        {} as TenantEntitlementProfileService,
        sharedTenantProvisioningService as unknown as SharedTenantProvisioningService,
        founderOperatorBetaGoService as unknown as FounderOperatorBetaGoService,
        founderOperatorBetaActivationService as unknown as FounderOperatorBetaActivationService,
      ),
      sharedTenantProvisioningService,
      founderOperatorBetaGoService,
      founderOperatorBetaActivationService,
    };
  }

  it('allows only policy-gated dormant shell provisioning', async () => {
    const {
      controller: adminController,
      sharedTenantProvisioningService,
      founderOperatorBetaGoService,
    } = controller();

    const user = {
      id: 'platform-admin',
      isPlatformAdmin: true,
    } as AuthenticatedUser;

    sharedTenantProvisioningService.provision.mockResolvedValue({ ok: true });
    await expect(
      adminController.provisionSharedBetaTenant(user, {}),
    ).resolves.toEqual({ ok: true });
    expect(
      founderOperatorBetaGoService.assertPreparationEnabled,
    ).toHaveBeenCalledTimes(1);
    expect(sharedTenantProvisioningService.provision).toHaveBeenCalledWith(
      user,
      {},
    );
  });

  it('delegates founder-operator GO issue and revoke without exposing secrets', async () => {
    const { controller: adminController, founderOperatorBetaGoService } =
      controller();
    const user = {
      id: 'platform-admin',
      isPlatformAdmin: true,
    } as AuthenticatedUser;
    founderOperatorBetaGoService.issue.mockResolvedValue({
      decision: 'ISSUED',
    });
    founderOperatorBetaGoService.revoke.mockResolvedValue({
      decision: 'REVOKED',
    });

    await expect(
      adminController.issueFounderOperatorBetaGo(user, 'tenant-id', {}),
    ).resolves.toEqual({ decision: 'ISSUED' });
    await expect(
      adminController.revokeFounderOperatorBetaGo(user, 'tenant-id', {}),
    ).resolves.toEqual({ decision: 'REVOKED' });
    expect(founderOperatorBetaGoService.issue).toHaveBeenCalledWith(
      user,
      'tenant-id',
      {},
    );
    expect(founderOperatorBetaGoService.revoke).toHaveBeenCalledWith(
      user,
      'tenant-id',
      {},
    );
  });

  it('delegates protected activation to the ACTIVE-only v2 coordinator', async () => {
    const {
      controller: adminController,
      founderOperatorBetaActivationService,
    } = controller();
    const user = {
      id: 'platform-admin',
      isPlatformAdmin: true,
    } as AuthenticatedUser;

    founderOperatorBetaActivationService.activate.mockResolvedValue({
      decision: 'ACTIVATED',
    });
    await expect(
      adminController.activateSharedBetaInitialOwner(user, 'tenant-id', {}),
    ).resolves.toEqual({ decision: 'ACTIVATED' });
    expect(founderOperatorBetaActivationService.activate).toHaveBeenCalledWith(
      user,
      'tenant-id',
      {},
    );
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

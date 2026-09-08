import type { AuthenticatedUser } from '../auth/auth.types';
import type { TenantEntitlementProfileService } from '../tenancy/tenant-entitlement-profile.service';
import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';
import type { FounderOperatorBetaActivationService } from './founder-operator-beta-activation.service';
import type { FounderOperatorBetaGoService } from './founder-operator-beta-go.service';
import type { FounderOwnerInviteLifecycleService } from './founder-owner-invite-lifecycle.service';
import type { SharedTenantProvisioningService } from './shared-tenant-provisioning.service';

describe('AdminController shared beta provisioning boundary', () => {
  function controller() {
    const adminService = {
      setStoreBackgroundExecution: jest.fn(),
    };
    const sharedTenantProvisioningService = {
      provision: jest.fn(),
      activateInitialOwner: jest.fn(),
    };
    const founderOperatorBetaGoService = {
      assertPreparationEnabled: jest.fn(),
      issue: jest.fn(),
      revoke: jest.fn(),
    };
    const founderOperatorBetaActivationService = {
      activate: jest.fn(),
    };
    const founderOwnerInviteLifecycleService = {
      status: jest.fn(),
      revoke: jest.fn(),
      reissue: jest.fn(),
      publishLink: jest.fn(),
    };
    return {
      controller: new AdminController(
        adminService as unknown as AdminService,
        {} as TenantEntitlementProfileService,
        sharedTenantProvisioningService as unknown as SharedTenantProvisioningService,
        founderOperatorBetaGoService as unknown as FounderOperatorBetaGoService,
        founderOperatorBetaActivationService as unknown as FounderOperatorBetaActivationService,
        founderOwnerInviteLifecycleService as unknown as FounderOwnerInviteLifecycleService,
      ),
      sharedTenantProvisioningService,
      founderOperatorBetaGoService,
      founderOperatorBetaActivationService,
      founderOwnerInviteLifecycleService,
      adminService,
    };
  }

  it('delegates exact store background execution commands to the platform control plane', async () => {
    const { controller: adminController, adminService } = controller();
    const user = {
      id: 'platform-admin',
      isPlatformAdmin: true,
    } as AuthenticatedUser;
    adminService.setStoreBackgroundExecution.mockResolvedValue({ ok: true });

    await expect(
      adminController.setStoreBackgroundExecution(
        user,
        'tenant-id',
        'store-id',
        { action: 'ENABLE' },
      ),
    ).resolves.toEqual({ ok: true });
    expect(adminService.setStoreBackgroundExecution).toHaveBeenCalledWith(
      user,
      'tenant-id',
      'store-id',
      { action: 'ENABLE' },
    );
  });

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

  it('delegates protected initial-owner status, revoke and reissue', async () => {
    const { controller: adminController, founderOwnerInviteLifecycleService } =
      controller();
    const user = {
      id: 'platform-admin',
      isPlatformAdmin: true,
    } as AuthenticatedUser;
    founderOwnerInviteLifecycleService.status.mockResolvedValue({
      ownerInvite: { state: 'ACTIVE' },
    });
    founderOwnerInviteLifecycleService.revoke.mockResolvedValue({
      decision: 'REVOKED',
    });
    founderOwnerInviteLifecycleService.reissue.mockResolvedValue({
      decision: 'REISSUED',
    });
    founderOwnerInviteLifecycleService.publishLink.mockResolvedValue({
      decision: 'LINK_PUBLISHED',
    });

    await expect(
      adminController.getSharedBetaInitialOwnerInviteStatus(user, 'tenant-id'),
    ).resolves.toEqual({ ownerInvite: { state: 'ACTIVE' } });
    await expect(
      adminController.revokeSharedBetaInitialOwnerInvite(user, 'tenant-id', {}),
    ).resolves.toEqual({ decision: 'REVOKED' });
    await expect(
      adminController.reissueSharedBetaInitialOwnerInvite(
        user,
        'tenant-id',
        {},
      ),
    ).resolves.toEqual({ decision: 'REISSUED' });
    await expect(
      adminController.publishSharedBetaInitialOwnerInviteLink(
        user,
        'tenant-id',
        {},
      ),
    ).resolves.toEqual({ decision: 'LINK_PUBLISHED' });
    expect(founderOwnerInviteLifecycleService.status).toHaveBeenCalledWith(
      user,
      'tenant-id',
    );
    expect(founderOwnerInviteLifecycleService.revoke).toHaveBeenCalledWith(
      user,
      'tenant-id',
      {},
    );
    expect(founderOwnerInviteLifecycleService.reissue).toHaveBeenCalledWith(
      user,
      'tenant-id',
      {},
    );
    expect(founderOwnerInviteLifecycleService.publishLink).toHaveBeenCalledWith(
      user,
      'tenant-id',
      {},
    );
  });
});

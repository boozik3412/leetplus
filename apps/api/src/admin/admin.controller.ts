import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { TenantEntitlementProfileService } from '../tenancy/tenant-entitlement-profile.service';
import {
  AdminService,
  type PlatformAdminAuditEventQuery,
} from './admin.service';
import { FounderOperatorBetaActivationService } from './founder-operator-beta-activation.service';
import { FounderOperatorBetaGoService } from './founder-operator-beta-go.service';
import { FounderOwnerInviteLifecycleService } from './founder-owner-invite-lifecycle.service';
import { SharedTenantProvisioningService } from './shared-tenant-provisioning.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly tenantEntitlementProfileService: TenantEntitlementProfileService,
    private readonly sharedTenantProvisioningService: SharedTenantProvisioningService,
    private readonly founderOperatorBetaGoService: FounderOperatorBetaGoService,
    private readonly founderOperatorBetaActivationService: FounderOperatorBetaActivationService,
    private readonly founderOwnerInviteLifecycleService: FounderOwnerInviteLifecycleService,
  ) {}

  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
  }

  @Get('audit-events')
  getAuditEvents(@Query() query: PlatformAdminAuditEventQuery) {
    return this.adminService.getAuditEvents(query);
  }

  @Get('audit-events/export')
  async exportAuditEvents(
    @Query() query: PlatformAdminAuditEventQuery,
  ): Promise<StreamableFile> {
    const file = await this.adminService.exportAuditEvents(query);

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.byteLength,
    });
  }

  @Get('tenants/:tenantId/langame/service-diagnostics')
  getTenantLangameServiceDiagnostics(@Param('tenantId') tenantId: string) {
    return this.adminService.getTenantLangameServiceDiagnostics(tenantId);
  }

  @Post('tenants/:tenantId/lifecycle')
  updateTenantLifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.adminService.updateTenantLifecycle(user, tenantId, body ?? {});
  }

  @Post('shared-beta/tenants/provision')
  provisionSharedBetaTenant(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    this.founderOperatorBetaGoService.assertPreparationEnabled();
    return this.sharedTenantProvisioningService.provision(user, body ?? {});
  }

  @Post('shared-beta/tenants/:tenantId/founder-operator-go')
  issueFounderOperatorBetaGo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.founderOperatorBetaGoService.issue(user, tenantId, body ?? {});
  }

  @Post('shared-beta/tenants/:tenantId/founder-operator-go/revoke')
  revokeFounderOperatorBetaGo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.founderOperatorBetaGoService.revoke(user, tenantId, body ?? {});
  }

  @Post('shared-beta/tenants/:tenantId/activate')
  activateSharedBetaInitialOwner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.founderOperatorBetaActivationService.activate(
      user,
      tenantId,
      body ?? {},
    );
  }

  @Get('tenants/:tenantId/initial-owner-invite')
  getSharedBetaInitialOwnerInviteStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
  ) {
    return this.founderOwnerInviteLifecycleService.status(user, tenantId);
  }

  @Post('tenants/:tenantId/initial-owner-invite/revoke')
  revokeSharedBetaInitialOwnerInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.founderOwnerInviteLifecycleService.revoke(
      user,
      tenantId,
      body ?? {},
    );
  }

  @Post('tenants/:tenantId/entitlement-profile')
  replaceTenantEntitlementProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.tenantEntitlementProfileService.replaceProfile(
      user,
      tenantId,
      body ?? {},
    );
  }

  @Post('tenants/:tenantId/support-note')
  addTenantSupportNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.adminService.addTenantSupportNote(user, tenantId, body ?? {});
  }

  @Post('integration-sources/:sourceId/support-action')
  updateIntegrationSourceSupportAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Body() body: unknown,
  ) {
    return this.adminService.updateIntegrationSourceSupportAction(
      user,
      sourceId,
      body ?? {},
    );
  }
}

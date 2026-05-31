import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
  }

  @Post('tenants/:tenantId/lifecycle')
  updateTenantLifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.adminService.updateTenantLifecycle(user, tenantId, body ?? {});
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

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
import {
  AdminService,
  type PlatformAdminAuditEventQuery,
} from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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

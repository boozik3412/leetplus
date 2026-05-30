import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  GuestsService,
  type GuestAudience,
  type GuestAudienceDto,
  type GuestCrmLead,
  type GuestCrmLeadDto,
  type GuestCrmLeadUpdateDto,
  type GuestCrmContactEvent,
  type GuestCrmContactEventDto,
  type GuestCrmTask,
  type GuestCrmTaskDto,
  type GuestCrmTaskReport,
  type GuestCrmTaskReportQuery,
  type GuestCrmTaskUpdateDto,
  type GuestCrmUser,
  type GuestCrmUpdateDto,
  type GuestExportFile,
  type GuestFilterOptions,
  type GuestSavedFilter,
  type GuestSavedFilterDto,
  type GuestDetail,
  type GuestListQuery,
  type GuestListResponse,
  type StaffIdentityMappingDto,
  type StaffIdentityMappingResult,
  type StaffOperationsReport,
  type StaffOperationsReportQuery,
  type StaffOperatorReport,
  type StaffOperatorReportQuery,
  type StaffControlQuery,
  type StaffControlReport,
  type GuestsSummary,
  type GuestsSummaryQuery,
} from './guests.service';

@Controller('guests')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.BUYER,
  UserRole.MARKETER,
  UserRole.CLUB_MANAGER,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Get('filter-options')
  getFilterOptions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestFilterOptions> {
    return this.guestsService.getFilterOptions(user);
  }

  @Get('summary')
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GuestsSummaryQuery,
  ): Promise<GuestsSummary> {
    return this.guestsService.getSummary(user, query);
  }

  @Get()
  getGuests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GuestListQuery,
  ): Promise<GuestListResponse> {
    return this.guestsService.getGuests(user, query);
  }

  @Get('saved-filters')
  getGuestSavedFilters(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestSavedFilter[]> {
    return this.guestsService.getGuestSavedFilters(user);
  }

  @Post('saved-filters')
  createGuestSavedFilter(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestSavedFilterDto,
  ): Promise<GuestSavedFilter> {
    return this.guestsService.createGuestSavedFilter(user, dto);
  }

  @Delete('saved-filters/:id')
  deleteGuestSavedFilter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ id: string }> {
    return this.guestsService.deleteGuestSavedFilter(user, id);
  }

  @Get('audiences')
  getGuestAudiences(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestAudience[]> {
    return this.guestsService.getGuestAudiences(user);
  }

  @Post('audiences')
  createGuestAudience(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestAudienceDto,
  ): Promise<GuestAudience> {
    return this.guestsService.createGuestAudience(user, dto);
  }

  @Delete('audiences/:id')
  deleteGuestAudience(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ id: string }> {
    return this.guestsService.deleteGuestAudience(user, id);
  }

  @Post('audiences/:id/tasks')
  createAudienceCrmTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestCrmTaskDto,
  ): Promise<GuestCrmTask> {
    return this.guestsService.createAudienceCrmTask(user, id, dto);
  }

  @Get('crm/leads')
  getGuestCrmLeads(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestCrmLead[]> {
    return this.guestsService.getGuestCrmLeads(user);
  }

  @Post('crm/leads')
  createGuestCrmLead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestCrmLeadDto,
  ): Promise<GuestCrmLead> {
    return this.guestsService.createGuestCrmLead(user, dto);
  }

  @Patch('crm/leads/:id')
  updateGuestCrmLead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestCrmLeadUpdateDto,
  ): Promise<GuestCrmLead> {
    return this.guestsService.updateGuestCrmLead(user, id, dto);
  }

  @Get('crm/tasks')
  getGuestCrmTasks(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestCrmTask[]> {
    return this.guestsService.getGuestCrmTasks(user);
  }

  @Get('crm/tasks/report')
  getGuestCrmTaskReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GuestCrmTaskReportQuery,
  ): Promise<GuestCrmTaskReport> {
    return this.guestsService.getGuestCrmTaskReport(user, query);
  }

  @Get('crm/tasks/export')
  async exportGuestCrmTasks(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GuestCrmTaskReportQuery,
  ): Promise<StreamableFile> {
    const file: GuestExportFile = await this.guestsService.exportGuestCrmTasks(
      user,
      query,
    );

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.byteLength,
    });
  }

  @Post('crm/tasks')
  createGuestCrmTask(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestCrmTaskDto,
  ): Promise<GuestCrmTask> {
    return this.guestsService.createGuestCrmTask(user, dto);
  }

  @Get('crm/users')
  getGuestCrmUsers(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestCrmUser[]> {
    return this.guestsService.getGuestCrmUsers(user);
  }

  @Get('crm/contact-events')
  getGuestCrmContactEvents(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestCrmContactEvent[]> {
    return this.guestsService.getGuestCrmContactEvents(user);
  }

  @Post('crm/contact-events')
  createGuestCrmContactEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestCrmContactEventDto,
  ): Promise<GuestCrmContactEvent> {
    return this.guestsService.createGuestCrmContactEvent(user, dto);
  }

  @Patch('crm/tasks/:id')
  updateGuestCrmTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestCrmTaskUpdateDto,
  ): Promise<GuestCrmTask> {
    return this.guestsService.updateGuestCrmTask(user, id, dto);
  }

  @Get('export')
  async exportGuests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GuestListQuery,
  ): Promise<StreamableFile> {
    const file: GuestExportFile = await this.guestsService.exportGuests(
      user,
      query,
    );

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.byteLength,
    });
  }

  @Get('staff-control')
  getStaffControl(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffControlQuery,
  ): Promise<StaffControlReport> {
    return this.guestsService.getStaffControl(user, query);
  }

  @Get('staff-control/operators')
  getStaffOperators(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffOperatorReportQuery,
  ): Promise<StaffOperatorReport> {
    return this.guestsService.getStaffOperators(user, query);
  }

  @Get('staff-control/operators/export')
  async exportStaffOperators(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffOperatorReportQuery,
  ): Promise<StreamableFile> {
    const file: GuestExportFile = await this.guestsService.exportStaffOperators(
      user,
      query,
    );

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.byteLength,
    });
  }

  @Get('staff-control/operations')
  getStaffOperations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffOperationsReportQuery,
  ): Promise<StaffOperationsReport> {
    return this.guestsService.getStaffOperations(user, query);
  }

  @Get('staff-control/operations/export')
  async exportStaffOperations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffOperationsReportQuery,
  ): Promise<StreamableFile> {
    const file: GuestExportFile =
      await this.guestsService.exportStaffOperations(user, query);

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.byteLength,
    });
  }

  @Post('staff-control/identity-mappings')
  mapStaffIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffIdentityMappingDto,
  ): Promise<StaffIdentityMappingResult> {
    return this.guestsService.mapStaffIdentity(user, dto);
  }

  @Delete('staff-control/identity-mappings/:id')
  unmapStaffIdentity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ id: string; updatedShifts: number }> {
    return this.guestsService.unmapStaffIdentity(user, id);
  }

  @Get(':id')
  getGuest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<GuestDetail> {
    return this.guestsService.getGuest(user, id);
  }

  @Patch(':id/crm')
  updateGuestCrm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestCrmUpdateDto,
  ): Promise<GuestDetail> {
    return this.guestsService.updateGuestCrm(user, id, dto);
  }
}

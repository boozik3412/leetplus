import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  StaffChecklistsService,
  type StaffChecklistCreateDto,
  type StaffChecklistExecutionExportQuery,
  type StaffChecklistExecutionReport,
  type StaffChecklistExecutionReportQuery,
  type StaffChecklistReport,
  type StaffChecklistsQuery,
  type StaffChecklistUpdateDto,
} from './staff-checklists.service';

@Controller('staff/checklists')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffChecklistsController {
  constructor(
    private readonly staffChecklistsService: StaffChecklistsService,
  ) {}

  @Get()
  getChecklists(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffChecklistsQuery,
  ): Promise<StaffChecklistReport> {
    return this.staffChecklistsService.getChecklists(user, query);
  }

  @Get('report')
  getExecutionReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffChecklistExecutionReportQuery,
  ): Promise<StaffChecklistExecutionReport> {
    return this.staffChecklistsService.getExecutionReport(user, query);
  }

  @Get('report/export')
  async exportExecutionReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffChecklistExecutionExportQuery,
  ): Promise<StreamableFile> {
    const file = await this.staffChecklistsService.exportExecutionReport(
      user,
      query,
    );

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.length,
    });
  }

  @Post()
  createChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffChecklistCreateDto,
  ) {
    return this.staffChecklistsService.createChecklist(user, dto);
  }

  @Patch(':id')
  updateChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffChecklistUpdateDto,
  ) {
    return this.staffChecklistsService.updateChecklist(user, id, dto);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  StaffTaskTemplatesService,
  type StaffTaskTemplateDto,
  type StaffTaskTemplateLaunchDto,
  type StaffTaskTemplateReport,
  type StaffTaskTemplatesQuery,
} from './staff-task-templates.service';

@Controller('staff/task-templates')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffTaskTemplatesController {
  constructor(
    private readonly staffTaskTemplatesService: StaffTaskTemplatesService,
  ) {}

  @Get()
  getTemplates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffTaskTemplatesQuery,
  ): Promise<StaffTaskTemplateReport> {
    return this.staffTaskTemplatesService.getTemplates(user, query);
  }

  @Post()
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffTaskTemplateDto,
  ) {
    return this.staffTaskTemplatesService.createTemplate(user, dto);
  }

  @Patch(':id')
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffTaskTemplateDto,
  ) {
    return this.staffTaskTemplatesService.updateTemplate(user, id, dto);
  }

  @Post(':id/tasks')
  createTaskFromTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffTaskTemplateLaunchDto,
  ) {
    return this.staffTaskTemplatesService.createTaskFromTemplate(user, id, dto);
  }
}

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
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  StaffChecklistTemplatesService,
  type StaffChecklistTemplateDto,
  type StaffChecklistTemplateReport,
  type StaffChecklistTemplatesQuery,
} from './staff-checklist-templates.service';

@Controller('staff/checklist-templates')
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
export class StaffChecklistTemplatesController {
  constructor(
    private readonly staffChecklistTemplatesService: StaffChecklistTemplatesService,
  ) {}

  @Get()
  getTemplates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffChecklistTemplatesQuery,
  ): Promise<StaffChecklistTemplateReport> {
    return this.staffChecklistTemplatesService.getTemplates(user, query);
  }

  @Post()
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.CLUB_MANAGER,
    UserRole.STANDARDS_MANAGER,
    UserRole.SENIOR_ADMINISTRATOR,
  )
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffChecklistTemplateDto,
  ) {
    return this.staffChecklistTemplatesService.createTemplate(user, dto);
  }

  @Patch(':id')
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.CLUB_MANAGER,
    UserRole.STANDARDS_MANAGER,
    UserRole.SENIOR_ADMINISTRATOR,
  )
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffChecklistTemplateDto,
  ) {
    return this.staffChecklistTemplatesService.updateTemplate(user, id, dto);
  }
}

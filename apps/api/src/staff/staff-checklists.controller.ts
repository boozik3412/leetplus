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
  StaffChecklistsService,
  type StaffChecklistCreateDto,
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

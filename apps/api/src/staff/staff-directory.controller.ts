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
  StaffDirectoryService,
  type StaffDirectoryQuery,
  type StaffDirectoryReport,
  type StaffMemberDto,
} from './staff-directory.service';

@Controller('staff/directory')
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
export class StaffDirectoryController {
  constructor(private readonly staffDirectoryService: StaffDirectoryService) {}

  @Get()
  getDirectory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffDirectoryQuery,
  ): Promise<StaffDirectoryReport> {
    return this.staffDirectoryService.getDirectory(user, query);
  }

  @Post()
  createMember(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffMemberDto,
  ) {
    return this.staffDirectoryService.createMember(user, dto);
  }

  @Patch(':id')
  updateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffMemberDto,
  ) {
    return this.staffDirectoryService.updateMember(user, id, dto);
  }
}

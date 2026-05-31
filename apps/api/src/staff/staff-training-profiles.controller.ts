import {
  Body,
  Controller,
  Get,
  Patch,
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
  StaffTrainingProfilesService,
  type StaffTrainingProfilesExportQuery,
  type StaffTrainingProfileReport,
  type StaffTrainingProfilesQuery,
  type StaffTrainingProgressDto,
} from './staff-training-profiles.service';

@Controller('staff/training-profiles')
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
export class StaffTrainingProfilesController {
  constructor(
    private readonly staffTrainingProfilesService: StaffTrainingProfilesService,
  ) {}

  @Get()
  getProfiles(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffTrainingProfilesQuery,
  ): Promise<StaffTrainingProfileReport> {
    return this.staffTrainingProfilesService.getProfiles(user, query);
  }

  @Get('export')
  async exportProfiles(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffTrainingProfilesExportQuery,
  ): Promise<StreamableFile> {
    const file = await this.staffTrainingProfilesService.exportProfiles(
      user,
      query,
    );

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.length,
    });
  }

  @Patch('progress')
  updateProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffTrainingProgressDto,
  ) {
    return this.staffTrainingProfilesService.updateProgress(user, dto);
  }
}

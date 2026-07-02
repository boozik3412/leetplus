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
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  StaffDisciplineService,
  type StaffAdministratorRatingsQuery,
  type StaffDisciplineExportQuery,
  type StaffDisciplinePolicyDto,
  type StaffDisciplineQuery,
  type StaffDisciplineRecordDto,
  type StaffDisciplineRecordUpdateDto,
} from './staff-discipline.service';

@Controller('staff/discipline')
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
export class StaffDisciplineController {
  constructor(
    private readonly staffDisciplineService: StaffDisciplineService,
  ) {}

  @Get()
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffDisciplineQuery,
  ) {
    return this.staffDisciplineService.getReport(user, query);
  }

  @Get('export')
  async exportRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffDisciplineExportQuery,
  ): Promise<StreamableFile> {
    const file = await this.staffDisciplineService.exportRecords(user, query);

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.length,
    });
  }

  @Patch('policy')
  updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffDisciplinePolicyDto,
  ) {
    return this.staffDisciplineService.updatePolicy(user, dto);
  }

  @Post('records')
  createRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffDisciplineRecordDto,
  ) {
    return this.staffDisciplineService.createRecord(user, dto);
  }

  @Patch('records/:id')
  updateRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffDisciplineRecordUpdateDto,
  ) {
    return this.staffDisciplineService.updateRecord(user, id, dto);
  }
}

@Controller('staff/administrator-ratings')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffAdministratorRatingsController {
  constructor(
    private readonly staffDisciplineService: StaffDisciplineService,
  ) {}

  @Get()
  getRatings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffAdministratorRatingsQuery,
  ) {
    return this.staffDisciplineService.getAdministratorRatings(user, query);
  }
}

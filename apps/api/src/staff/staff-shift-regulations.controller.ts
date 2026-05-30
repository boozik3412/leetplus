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
  StaffShiftRegulationsService,
  type StaffShiftRegulationDto,
  type StaffShiftRegulationReport,
  type StaffShiftRegulationsQuery,
} from './staff-shift-regulations.service';

@Controller('staff/shift-regulations')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffShiftRegulationsController {
  constructor(
    private readonly staffShiftRegulationsService: StaffShiftRegulationsService,
  ) {}

  @Get()
  getRegulations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffShiftRegulationsQuery,
  ): Promise<StaffShiftRegulationReport> {
    return this.staffShiftRegulationsService.getRegulations(user, query);
  }

  @Post()
  createRegulation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffShiftRegulationDto,
  ) {
    return this.staffShiftRegulationsService.createRegulation(user, dto);
  }

  @Patch(':id')
  updateRegulation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffShiftRegulationDto,
  ) {
    return this.staffShiftRegulationsService.updateRegulation(user, id, dto);
  }
}

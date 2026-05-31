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
  StaffAssessmentsService,
  type StaffAssessmentDto,
  type StaffAssessmentReport,
  type StaffAssessmentSubmitDto,
  type StaffAssessmentsQuery,
} from './staff-assessments.service';

@Controller('staff/assessments')
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
export class StaffAssessmentsController {
  constructor(
    private readonly staffAssessmentsService: StaffAssessmentsService,
  ) {}

  @Get()
  getAssessments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffAssessmentsQuery,
  ): Promise<StaffAssessmentReport> {
    return this.staffAssessmentsService.getAssessments(user, query);
  }

  @Post()
  createAssessment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffAssessmentDto,
  ) {
    return this.staffAssessmentsService.createAssessment(user, dto);
  }

  @Patch(':id')
  updateAssessment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffAssessmentDto,
  ) {
    return this.staffAssessmentsService.updateAssessment(user, id, dto);
  }

  @Post(':id/results')
  submitResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffAssessmentSubmitDto,
  ) {
    return this.staffAssessmentsService.submitResult(user, id, dto);
  }
}

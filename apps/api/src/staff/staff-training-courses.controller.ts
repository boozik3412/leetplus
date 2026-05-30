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
  StaffTrainingCoursesService,
  type StaffTrainingCourseDto,
  type StaffTrainingCourseReport,
  type StaffTrainingCoursesQuery,
} from './staff-training-courses.service';

@Controller('staff/training-courses')
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
export class StaffTrainingCoursesController {
  constructor(
    private readonly staffTrainingCoursesService: StaffTrainingCoursesService,
  ) {}

  @Get()
  getCourses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffTrainingCoursesQuery,
  ): Promise<StaffTrainingCourseReport> {
    return this.staffTrainingCoursesService.getCourses(user, query);
  }

  @Post()
  createCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffTrainingCourseDto,
  ) {
    return this.staffTrainingCoursesService.createCourse(user, dto);
  }

  @Patch(':id')
  updateCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffTrainingCourseDto,
  ) {
    return this.staffTrainingCoursesService.updateCourse(user, id, dto);
  }
}

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
  StaffTasksService,
  type StaffTaskCommentDto,
  type StaffTaskDto,
  type StaffTaskReport,
  type StaffTasksQuery,
} from './staff-tasks.service';

@Controller('staff/tasks')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffTasksController {
  constructor(private readonly staffTasksService: StaffTasksService) {}

  @Get()
  getTasks(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffTasksQuery,
  ): Promise<StaffTaskReport> {
    return this.staffTasksService.getTasks(user, query);
  }

  @Post()
  createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffTaskDto,
  ) {
    return this.staffTasksService.createTask(user, dto);
  }

  @Patch(':id')
  updateTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffTaskDto,
  ) {
    return this.staffTasksService.updateTask(user, id, dto);
  }

  @Post(':id/comments')
  createTaskComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffTaskCommentDto,
  ) {
    return this.staffTasksService.createTaskComment(user, id, dto);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { from, interval, map, startWith, switchMap } from 'rxjs';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  StaffTeamChatService,
  type StaffChatChannelDto,
  type StaffChatMessageDto,
  type StaffChatMessageUpdateDto,
  type StaffChatReadDto,
  type StaffTeamChatQuery,
} from './staff-team-chat.service';

const TEAM_CHAT_EVENTS_INTERVAL_MS = 5_000;

@Controller('staff/team-chat')
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
export class StaffTeamChatController {
  constructor(private readonly staffTeamChatService: StaffTeamChatService) {}

  @Get()
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffTeamChatQuery,
  ) {
    return this.staffTeamChatService.getReport(user, query);
  }

  @Sse('events')
  events(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffTeamChatQuery,
  ) {
    return interval(TEAM_CHAT_EVENTS_INTERVAL_MS).pipe(
      startWith(0),
      switchMap(() =>
        from(this.staffTeamChatService.getLiveState(user, query)),
      ),
      map((data) => ({
        type: 'team-chat-state',
        retry: TEAM_CHAT_EVENTS_INTERVAL_MS,
        data,
      })),
    );
  }

  @Post('channels')
  createChannel(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffChatChannelDto,
  ) {
    return this.staffTeamChatService.createChannel(user, dto);
  }

  @Post('messages')
  createMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffChatMessageDto,
  ) {
    return this.staffTeamChatService.createMessage(user, dto);
  }

  @Patch('messages/:id')
  updateMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffChatMessageUpdateDto,
  ) {
    return this.staffTeamChatService.updateMessage(user, id, dto);
  }

  @Post('read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffChatReadDto,
  ) {
    return this.staffTeamChatService.markRead(user, dto);
  }
}

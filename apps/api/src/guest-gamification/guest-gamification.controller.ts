import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  GuestGamificationService,
  type GuestGameEvent,
  type GuestGameEventDto,
  type GuestGameDryRunDto,
  type GuestGameDryRunResult,
  type GuestGamePipelineRunDto,
  type GuestGamePipelineRunResult,
  type GuestGameProcessEventDto,
  type GuestGameProcessEventResult,
  type GuestGameLootBox,
  type GuestGameLootBoxDto,
  type GuestGameLootBoxUpdateDto,
  type GuestGameMission,
  type GuestGameMissionDto,
  type GuestGameMissionUpdateDto,
  type GuestGameProfile,
  type GuestGameProfileDto,
  type GuestGameProfileUpdateDto,
  type GuestGameReward,
  type GuestGameRewardDto,
  type GuestGameRewardUpdateDto,
  type GuestGameSeason,
  type GuestGameSeasonDto,
  type GuestGameSeasonUpdateDto,
  type GuestGameSnapshotFactsResult,
  type GuestGamificationWorkspace,
} from './guest-gamification.service';

@Controller('guests/gamification')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MARKETER,
  UserRole.CLUB_MANAGER,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuestGamificationController {
  constructor(private readonly gamificationService: GuestGamificationService) {}

  @Get('workspace')
  getWorkspace(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGamificationWorkspace> {
    return this.gamificationService.getWorkspace(user);
  }

  @Post('dry-run')
  dryRun(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameDryRunDto,
  ): Promise<GuestGameDryRunResult> {
    return this.gamificationService.dryRun(user, dto);
  }

  @Get('facts')
  getSnapshotFacts(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGameSnapshotFactsResult> {
    return this.gamificationService.getSnapshotFacts(user);
  }

  @Post('process-event')
  processEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameProcessEventDto,
  ): Promise<GuestGameProcessEventResult> {
    return this.gamificationService.processEvent(user, dto);
  }

  @Post('pipeline/run')
  runSnapshotPipeline(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGamePipelineRunDto,
  ): Promise<GuestGamePipelineRunResult> {
    return this.gamificationService.runSnapshotPipeline(user, dto);
  }

  @Get('profiles')
  getProfiles(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGameProfile[]> {
    return this.gamificationService.getProfiles(user);
  }

  @Post('profiles')
  createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameProfileDto,
  ): Promise<GuestGameProfile> {
    return this.gamificationService.createProfile(user, dto);
  }

  @Patch('profiles/:id')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestGameProfileUpdateDto,
  ): Promise<GuestGameProfile> {
    return this.gamificationService.updateProfile(user, id, dto);
  }

  @Get('loot-boxes')
  getLootBoxes(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGameLootBox[]> {
    return this.gamificationService.getLootBoxes(user);
  }

  @Post('loot-boxes')
  createLootBox(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameLootBoxDto,
  ): Promise<GuestGameLootBox> {
    return this.gamificationService.createLootBox(user, dto);
  }

  @Patch('loot-boxes/:id')
  updateLootBox(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestGameLootBoxUpdateDto,
  ): Promise<GuestGameLootBox> {
    return this.gamificationService.updateLootBox(user, id, dto);
  }

  @Get('missions')
  getMissions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGameMission[]> {
    return this.gamificationService.getMissions(user);
  }

  @Post('missions')
  createMission(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameMissionDto,
  ): Promise<GuestGameMission> {
    return this.gamificationService.createMission(user, dto);
  }

  @Patch('missions/:id')
  updateMission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestGameMissionUpdateDto,
  ): Promise<GuestGameMission> {
    return this.gamificationService.updateMission(user, id, dto);
  }

  @Get('seasons')
  getSeasons(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGameSeason[]> {
    return this.gamificationService.getSeasons(user);
  }

  @Post('seasons')
  createSeason(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameSeasonDto,
  ): Promise<GuestGameSeason> {
    return this.gamificationService.createSeason(user, dto);
  }

  @Patch('seasons/:id')
  updateSeason(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestGameSeasonUpdateDto,
  ): Promise<GuestGameSeason> {
    return this.gamificationService.updateSeason(user, id, dto);
  }

  @Get('rewards')
  getRewards(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGameReward[]> {
    return this.gamificationService.getRewards(user);
  }

  @Get('rewards/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="guest-game-rewards.csv"',
  )
  exportRewards(@CurrentUser() user: AuthenticatedUser): Promise<string> {
    return this.gamificationService.exportRewardsCsv(user);
  }

  @Post('rewards')
  createReward(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameRewardDto,
  ): Promise<GuestGameReward> {
    return this.gamificationService.createReward(user, dto);
  }

  @Patch('rewards/:id')
  updateReward(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestGameRewardUpdateDto,
  ): Promise<GuestGameReward> {
    return this.gamificationService.updateReward(user, id, dto);
  }

  @Get('events')
  getEvents(@CurrentUser() user: AuthenticatedUser): Promise<GuestGameEvent[]> {
    return this.gamificationService.getEvents(user);
  }

  @Post('events')
  createEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameEventDto,
  ): Promise<GuestGameEvent> {
    return this.gamificationService.createEvent(user, dto);
  }
}

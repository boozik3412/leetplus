import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
  GuestBonusLedgerService,
  type GuestGameBonusLedgerCancelDto,
  type GuestGameBonusLedgerDispatchDto,
  type GuestGameBonusLedgerDispatchItem,
  type GuestGameBonusLedgerDispatchResult,
  type GuestGameBonusLedgerQueueDto,
  type GuestGameBonusLedgerQueueResult,
  type GuestGameBonusLedgerStatus,
} from './guest-bonus-ledger.service';
import {
  GuestActivityLedgerService,
  type GuestActivityLedgerDiagnostics,
} from './guest-activity-ledger.service';
import { GuestGamificationLogService } from './guest-gamification-log.service';
import { GuestGameQualityMonitoringService } from './guest-game-quality-monitoring.service';
import type { GuestGameMissionWizardDto } from './guest-game-mission-contract';
import {
  GuestGamificationService,
  type GuestGameCheckInDto,
  type GuestGameCheckInResult,
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
  type GuestGameGuestLogTypeMapping,
  type GuestGameGuestLogTypeMappingDto,
  type GuestGameMission,
  type GuestGameMissionDto,
  type GuestGameMissionUpdateDto,
  type GuestGameMissionWizardSaveResult,
  type GuestGamePromoCard,
  type GuestGamePromoCardDto,
  type GuestGamePromoCardUpdateDto,
  type GuestGameProfile,
  type GuestGameProfileDto,
  type GuestGameProfileUpdateDto,
  type GuestGameReward,
  type GuestGameRewardDto,
  type GuestGameRewardRedeemDto,
  type GuestGameRewardUpdateDto,
  type GuestGameRuleDeleteResult,
  type GuestGameRuleDeleteOptions,
  type GuestGameDelivery,
  type GuestGameDeliveryDispatchDto,
  type GuestGameDeliveryDispatchResult,
  type GuestGameDeliveryDispatcherStatus,
  type GuestGameDeliveryPrepareDto,
  type GuestGameDeliveryPrepareResult,
  type GuestGameDeliveryUpdateDto,
  type GuestGameSeason,
  type GuestGameSeasonDto,
  type GuestGameSeasonUpdateDto,
  type GuestGameSnapshotFactsResult,
  type GuestGameVisualDraft,
  type GuestGameVisualDraftDto,
  type GuestGameVisualEditorPreview,
  type GuestGameVisualEventSyncDto,
  type GuestGameVisualEventSyncResult,
  type GuestGameVisualEventSyncStatus,
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
  constructor(
    private readonly gamificationService: GuestGamificationService,
    private readonly activityLedgerService: GuestActivityLedgerService,
    private readonly gamificationLogService: GuestGamificationLogService,
    private readonly qualityMonitoringService: GuestGameQualityMonitoringService,
    private readonly bonusLedgerService: GuestBonusLedgerService,
  ) {}

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

  @Get('activity-ledger/diagnostics')
  getActivityLedgerDiagnostics(
    @CurrentUser() user: AuthenticatedUser,
    @Query('profileId') profileId?: string,
    @Query('guestId') guestId?: string,
    @Query('externalGuestId') externalGuestId?: string,
    @Query('limit') limit?: string,
  ): Promise<GuestActivityLedgerDiagnostics> {
    return this.activityLedgerService.getDiagnostics(user, {
      profileId,
      guestId,
      externalGuestId,
      limit,
    });
  }

  @Get('log/search')
  searchGamificationLogProfiles(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query?: string,
  ) {
    return this.gamificationLogService.searchProfiles(user, query);
  }

  @Get('log/monitoring')
  getGamificationLogMonitoring(@CurrentUser() user: AuthenticatedUser) {
    return this.qualityMonitoringService.getDashboard(user);
  }

  @Get('log/profiles/:profileId')
  getGamificationLogProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileId') profileId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.gamificationLogService.getProfileLog(user, profileId, query);
  }

  @Post('log/profiles/:profileId/sync')
  syncGamificationLogProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileId') profileId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.gamificationLogService.syncProfile(user, profileId, {
      storeId,
    });
  }

  @Post('log/profiles/:profileId/relink')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  relinkGamificationLogProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileId') profileId: string,
    @Body() body: { candidateGuestId?: string },
  ) {
    return this.gamificationLogService.relinkProfile(
      user,
      profileId,
      body.candidateGuestId?.trim() ?? '',
    );
  }

  @Post('process-event')
  processEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameProcessEventDto,
  ): Promise<GuestGameProcessEventResult> {
    return this.gamificationService.processEvent(user, dto);
  }

  @Post('check-ins')
  checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameCheckInDto,
  ): Promise<GuestGameCheckInResult> {
    return this.gamificationService.checkIn(user, dto);
  }

  @Post('pipeline/run')
  runSnapshotPipeline(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGamePipelineRunDto,
  ): Promise<GuestGamePipelineRunResult> {
    return this.gamificationService.runSnapshotPipeline(user, dto);
  }

  @Post('guest-log-mappings')
  upsertGuestLogTypeMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameGuestLogTypeMappingDto,
  ): Promise<GuestGameGuestLogTypeMapping> {
    return this.gamificationService.upsertGuestLogTypeMapping(user, dto);
  }

  @Delete('guest-log-mappings/:id')
  deleteGuestLogTypeMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ deleted: true }> {
    return this.gamificationService.deleteGuestLogTypeMapping(user, id);
  }

  @Get('guest-log-catalog/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="guest-game-guest-log-catalog.csv"',
  )
  exportGuestLogCatalog(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<string> {
    return this.gamificationService.exportGuestLogCatalogCsv(user);
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

  @Delete('loot-boxes/:id')
  deleteLootBox(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: GuestGameRuleDeleteOptions,
  ): Promise<GuestGameRuleDeleteResult> {
    return this.gamificationService.deleteLootBox(user, id, query);
  }

  @Post('loot-boxes/:id/restart')
  restartLootBox(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{
    lootBox: GuestGameLootBox;
    restartedAt: string;
    canceledRewards: number;
  }> {
    return this.gamificationService.restartLootBox(user, id);
  }

  @Get('missions')
  getMissions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGameMission[]> {
    return this.gamificationService.getMissions(user);
  }

  @Post('missions/wizard/readiness')
  getMissionWizardReadiness(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameMissionWizardDto,
  ) {
    return this.gamificationService.validateMissionWizard(user, dto);
  }

  @Post('missions/wizard')
  saveNewMissionWizard(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameMissionWizardDto,
  ): Promise<GuestGameMissionWizardSaveResult> {
    return this.gamificationService.saveMissionWizard(user, dto);
  }

  @Patch('missions/wizard/:id')
  saveMissionWizard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestGameMissionWizardDto,
  ): Promise<GuestGameMissionWizardSaveResult> {
    return this.gamificationService.saveMissionWizard(user, dto, id);
  }

  @Post('missions/wizard/:id/activate')
  activateMissionWizard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<GuestGameMissionWizardSaveResult> {
    return this.gamificationService.activateMissionWizard(user, id);
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

  @Delete('missions/:id')
  deleteMission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: GuestGameRuleDeleteOptions,
  ): Promise<GuestGameRuleDeleteResult> {
    return this.gamificationService.deleteMission(user, id, query);
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

  @Delete('seasons/:id')
  deleteSeason(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: GuestGameRuleDeleteOptions,
  ): Promise<GuestGameRuleDeleteResult> {
    return this.gamificationService.deleteSeason(user, id, query);
  }

  @Get('promo-cards')
  getPromoCards(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGamePromoCard[]> {
    return this.gamificationService.getPromoCards(user);
  }

  @Post('promo-cards')
  createPromoCard(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGamePromoCardDto,
  ): Promise<GuestGamePromoCard> {
    return this.gamificationService.createPromoCard(user, dto);
  }

  @Patch('promo-cards/:id')
  updatePromoCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestGamePromoCardUpdateDto,
  ): Promise<GuestGamePromoCard> {
    return this.gamificationService.updatePromoCard(user, id, dto);
  }

  @Delete('promo-cards/:id')
  deletePromoCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: GuestGameRuleDeleteOptions,
  ): Promise<GuestGameRuleDeleteResult> {
    return this.gamificationService.deletePromoCard(user, id, query);
  }

  @Get('visual-editor/events/sync-status')
  getVisualEditorEventSyncStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGameVisualEventSyncStatus> {
    return this.gamificationService.getVisualEditorEventSyncStatus(user);
  }

  @Post('visual-editor/events/sync')
  syncVisualEditorEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameVisualEventSyncDto,
  ): Promise<GuestGameVisualEventSyncResult> {
    return this.gamificationService.syncVisualEditorEvents(user, dto);
  }

  @Get('visual-editor/draft')
  getVisualEditorDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Query('id') id?: string,
    @Query('storeId') storeId?: string,
  ): Promise<GuestGameVisualDraft> {
    return this.gamificationService.getVisualEditorDraft(user, {
      id,
      storeId,
    });
  }

  @Patch('visual-editor/draft')
  updateVisualEditorDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameVisualDraftDto,
  ): Promise<GuestGameVisualDraft> {
    return this.gamificationService.updateVisualEditorDraft(user, dto);
  }

  @Post('visual-editor/draft/publish')
  publishVisualEditorDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameVisualDraftDto,
  ): Promise<GuestGameVisualEditorPreview> {
    return this.gamificationService.publishVisualEditorDraft(user, dto);
  }

  @Get('visual-editor/preview')
  getVisualEditorPreview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('id') id?: string,
    @Query('storeId') storeId?: string,
  ): Promise<GuestGameVisualEditorPreview> {
    return this.gamificationService.getVisualEditorPreview(user, {
      id,
      storeId,
    });
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

  @Get('overview/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="guest-game-overview.csv"',
  )
  exportOverview(@CurrentUser() user: AuthenticatedUser): Promise<string> {
    return this.gamificationService.exportOverviewCsv(user);
  }

  @Post('rewards/redeem')
  redeemReward(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameRewardRedeemDto,
  ): Promise<GuestGameReward> {
    return this.gamificationService.redeemReward(user, dto);
  }

  @Post('rewards')
  createReward(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameRewardDto,
  ): Promise<GuestGameReward> {
    return this.gamificationService.createReward(user, dto);
  }

  @Patch('rewards/:id')
  async updateReward(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestGameRewardUpdateDto,
  ): Promise<GuestGameReward> {
    const reward = await this.gamificationService.updateReward(user, id, dto);

    return reward;
  }

  @Get('deliveries')
  getDeliveries(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGameDelivery[]> {
    return this.gamificationService.getDeliveries(user);
  }

  @Get('deliveries/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="guest-game-deliveries.csv"',
  )
  exportDeliveries(@CurrentUser() user: AuthenticatedUser): Promise<string> {
    return this.gamificationService.exportDeliveriesCsv(user);
  }

  @Post('deliveries/prepare')
  prepareDeliveries(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameDeliveryPrepareDto,
  ): Promise<GuestGameDeliveryPrepareResult> {
    return this.gamificationService.prepareDeliveries(user, dto);
  }

  @Get('deliveries/dispatcher')
  getDeliveryDispatcherStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGameDeliveryDispatcherStatus> {
    return this.gamificationService.getDeliveryDispatcherStatus(user);
  }

  @Post('deliveries/dispatch')
  dispatchDeliveries(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameDeliveryDispatchDto,
  ): Promise<GuestGameDeliveryDispatchResult> {
    return this.gamificationService.dispatchDeliveries(user, dto);
  }

  @Get('bonus-ledger/status')
  getBonusLedgerStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuestGameBonusLedgerStatus> {
    return this.bonusLedgerService.getStatus(user);
  }

  @Post('bonus-ledger/queue')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  queueBonusLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameBonusLedgerQueueDto,
  ): Promise<GuestGameBonusLedgerQueueResult> {
    return this.bonusLedgerService.queueApprovedRewards(user, dto);
  }

  @Post('bonus-ledger/dispatch')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  dispatchBonusLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GuestGameBonusLedgerDispatchDto,
  ): Promise<GuestGameBonusLedgerDispatchResult> {
    return this.bonusLedgerService.dispatch(user, dto);
  }

  @Post('bonus-ledger/:id/cancel')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  cancelBonusLedgerEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestGameBonusLedgerCancelDto,
  ): Promise<GuestGameBonusLedgerDispatchItem> {
    return this.bonusLedgerService.cancelEntry(user, id, dto);
  }

  @Patch('deliveries/:id')
  updateDelivery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GuestGameDeliveryUpdateDto,
  ): Promise<GuestGameDelivery> {
    return this.gamificationService.updateDelivery(user, id, dto);
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

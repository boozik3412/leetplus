import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StoreFloorPlanAttentionService } from './store-floor-plan-attention.service';
import { StoreFloorPlanLiveService } from './store-floor-plan-live.service';
import {
  SHIFT_ADMIN_VIEWER_ROLES,
  StoreFloorPlanShiftAdminService,
} from './store-floor-plan-shift-admin.service';
import {
  StoreFloorPlansService,
  type SaveStoreFloorPlanDto,
} from './store-floor-plans.service';

const TENANT_USER_ROLES = Object.values(UserRole);

/** «Схема клуба»: the saved hall layout and the live state of the club. */
@Controller('stores')
export class StoreFloorPlansController {
  constructor(
    private readonly storeFloorPlansService: StoreFloorPlansService,
    private readonly storeFloorPlanLiveService: StoreFloorPlanLiveService,
    private readonly storeFloorPlanAttentionService: StoreFloorPlanAttentionService,
    private readonly storeFloorPlanShiftAdminService: StoreFloorPlanShiftAdminService,
  ) {}

  @Roles(...TENANT_USER_ROLES)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('floor-plans')
  listClubs(@CurrentUser() user: AuthenticatedUser) {
    return this.storeFloorPlansService.listClubs(user);
  }

  @Roles(...TENANT_USER_ROLES)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id/floor-plan')
  getFloorPlan(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeFloorPlansService.get(id, user);
  }

  @Roles(...TENANT_USER_ROLES)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id/floor-plan/live')
  getFloorPlanLive(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeFloorPlanLiveService.get(id, user);
  }

  @Roles(...TENANT_USER_ROLES)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id/floor-plan/live/seats/:number')
  getFloorPlanSeat(
    @Param('id') id: string,
    @Param('number', ParseIntPipe) number: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeFloorPlanLiveService.getSeat(id, number, user);
  }

  /** Hints about the guests at the computers and the guests' messages. */
  @Roles(...TENANT_USER_ROLES)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id/floor-plan/live/attention')
  getFloorPlanAttention(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeFloorPlanAttentionService.get(id, user);
  }

  /** «Подробнее» of the game module block: rewards guests got this shift. */
  @Roles(...TENANT_USER_ROLES)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id/floor-plan/live/game-completions')
  getFloorPlanGameCompletions(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeFloorPlanLiveService.getGameCompletions(id, user);
  }

  /**
   * «Режим администратора смены»: checklist and tasks of the administrator
   * of the open Langame shift, for a senior administrator and above.
   */
  @Roles(...SHIFT_ADMIN_VIEWER_ROLES)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id/floor-plan/live/shift-admin')
  getFloorPlanShiftAdmin(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeFloorPlanShiftAdminService.getShiftAdminWork(id, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id/floor-plan')
  saveFloorPlan(
    @Param('id') id: string,
    @Body() body: SaveStoreFloorPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeFloorPlansService.save(id, body ?? {}, user);
  }
}

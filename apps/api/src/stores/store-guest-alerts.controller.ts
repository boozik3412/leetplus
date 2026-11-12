import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  StoreFloorPlanAttentionService,
  type StoreFloorPlanAlertUpdateDto,
} from './store-floor-plan-attention.service';

const TENANT_USER_ROLES = Object.values(UserRole);

/**
 * «Иду» / «Решено» on a guest message from «Схема клуба». Answering guests is
 * communications work (`manage_communications`); the service also requires
 * the scheme and the «Гости» section and the message's club in fresh scope.
 */
@Controller('stores')
export class StoreGuestAlertsController {
  constructor(
    private readonly storeFloorPlanAttentionService: StoreFloorPlanAttentionService,
  ) {}

  @Roles(...TENANT_USER_ROLES)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/floor-plan/live/alerts/:ticketId')
  @HttpCode(200)
  updateAlert(
    @Param('id') id: string,
    @Param('ticketId') ticketId: string,
    @Body() body: StoreFloorPlanAlertUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeFloorPlanAttentionService.updateAlert(
      id,
      ticketId,
      body ?? {},
      user,
    );
  }
}

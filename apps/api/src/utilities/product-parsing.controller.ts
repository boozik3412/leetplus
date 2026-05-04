import {
  Body,
  Controller,
  Get,
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
import { ProductParsingService } from './product-parsing.service';

@Controller('utilities/product-parsing')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.BUYER)
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductParsingController {
  constructor(private readonly productParsingService: ProductParsingService) {}

  @Get()
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.productParsingService.getOverview(user);
  }

  @Post('analyze')
  analyze(@CurrentUser() user: AuthenticatedUser) {
    return this.productParsingService.analyze(user);
  }

  @Get('manual')
  getManualOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.productParsingService.getManualOverview(user);
  }

  @Post('manual/groups')
  createManualGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { name?: string; productIds?: string[] },
  ) {
    return this.productParsingService.createManualGroup(user, dto);
  }

  @Patch('manual/groups/:id')
  updateManualGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: { name?: string; productIds?: string[] },
  ) {
    return this.productParsingService.updateManualGroup(user, id, dto);
  }

  @Post('suggestions/:id/apply')
  applySuggestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: { selectedName?: string; productIds?: string[] },
  ) {
    return this.productParsingService.applySuggestion(user, id, dto);
  }

  @Post('suggestions/:id/reject')
  rejectSuggestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.productParsingService.rejectSuggestion(user, id);
  }
}

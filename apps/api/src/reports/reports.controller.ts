import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService, type AssortmentReport } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('assortment')
  getAssortmentReport(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssortmentReport> {
    return this.reportsService.getAssortmentReport(user);
  }
}

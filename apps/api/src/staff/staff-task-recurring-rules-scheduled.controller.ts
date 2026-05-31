import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StaffTaskRecurringRulesService,
  type StaffTaskRecurringRuleRunDueDto,
  type StaffTaskRecurringRuleRunDueResult,
} from './staff-task-recurring-rules.service';

@Controller('staff/task-rules/scheduled')
export class StaffTaskRecurringRulesScheduledController {
  constructor(
    private readonly configService: ConfigService,
    private readonly staffTaskRecurringRulesService: StaffTaskRecurringRulesService,
  ) {}

  @Post('run-due')
  runDueRules(
    @Headers('x-sync-service-token') token: string | undefined,
    @Body() dto: StaffTaskRecurringRuleRunDueDto,
  ): Promise<StaffTaskRecurringRuleRunDueResult> {
    this.assertToken(token);

    return this.staffTaskRecurringRulesService.runDueRulesForAllTenants(dto);
  }

  private assertToken(token: string | undefined) {
    const expectedToken = this.configService
      .get<string>('SYNC_SERVICE_TOKEN')
      ?.trim();

    if (!expectedToken) {
      throw new UnauthorizedException('SYNC_SERVICE_TOKEN is not configured');
    }

    if (!token || token !== expectedToken) {
      throw new UnauthorizedException('Invalid sync service token');
    }
  }
}

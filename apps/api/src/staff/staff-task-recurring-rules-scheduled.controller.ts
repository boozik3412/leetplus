import {
  Body,
  Controller,
  Headers,
  Post,
  ServiceUnavailableException,
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
    this.assertEnabled();
    this.assertToken(token);

    return this.staffTaskRecurringRulesService.runDueRulesForAllTenants(dto);
  }

  private assertEnabled() {
    if (
      this.configService.get<string>(
        'STAFF_TASK_RULES_SCHEDULED_HTTP_ENABLED',
      ) !== 'true'
    ) {
      throw new ServiceUnavailableException(
        'Scheduled staff task rule execution is disabled',
      );
    }
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

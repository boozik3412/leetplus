import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { StaffChecklistsController } from './staff-checklists.controller';
import { StaffChecklistsService } from './staff-checklists.service';
import { StaffShiftRegulationsController } from './staff-shift-regulations.controller';
import { StaffShiftRegulationsService } from './staff-shift-regulations.service';
import { StaffTeamChatController } from './staff-team-chat.controller';
import { StaffTeamChatService } from './staff-team-chat.service';
import { StaffTasksController } from './staff-tasks.controller';
import { StaffTasksService } from './staff-tasks.service';

@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [
    StaffTasksController,
    StaffShiftRegulationsController,
    StaffChecklistsController,
    StaffTeamChatController,
  ],
  providers: [
    StaffTasksService,
    StaffShiftRegulationsService,
    StaffChecklistsService,
    StaffTeamChatService,
  ],
})
export class StaffModule {}

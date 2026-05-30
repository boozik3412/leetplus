import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { StaffChecklistTemplatesController } from './staff-checklist-templates.controller';
import { StaffChecklistTemplatesService } from './staff-checklist-templates.service';
import { StaffChecklistsController } from './staff-checklists.controller';
import { StaffChecklistsService } from './staff-checklists.service';
import { StaffShiftRegulationsController } from './staff-shift-regulations.controller';
import { StaffShiftRegulationsService } from './staff-shift-regulations.service';
import { StaffTaskTemplatesController } from './staff-task-templates.controller';
import { StaffTaskTemplatesService } from './staff-task-templates.service';
import { StaffTeamChatController } from './staff-team-chat.controller';
import { StaffTeamChatService } from './staff-team-chat.service';
import { StaffTasksController } from './staff-tasks.controller';
import { StaffTasksService } from './staff-tasks.service';

@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [
    StaffTasksController,
    StaffTaskTemplatesController,
    StaffShiftRegulationsController,
    StaffChecklistTemplatesController,
    StaffChecklistsController,
    StaffTeamChatController,
  ],
  providers: [
    StaffTasksService,
    StaffTaskTemplatesService,
    StaffShiftRegulationsService,
    StaffChecklistTemplatesService,
    StaffChecklistsService,
    StaffTeamChatService,
  ],
})
export class StaffModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { StaffChecklistTemplatesController } from './staff-checklist-templates.controller';
import { StaffChecklistTemplatesService } from './staff-checklist-templates.service';
import { StaffChecklistsController } from './staff-checklists.controller';
import { StaffChecklistsService } from './staff-checklists.service';
import { StaffKnowledgeBaseController } from './staff-knowledge-base.controller';
import { StaffKnowledgeBaseService } from './staff-knowledge-base.service';
import { StaffOnboardingPlansController } from './staff-onboarding-plans.controller';
import { StaffOnboardingPlansService } from './staff-onboarding-plans.service';
import { StaffShiftRegulationsController } from './staff-shift-regulations.controller';
import { StaffShiftRegulationsService } from './staff-shift-regulations.service';
import { StaffTaskTemplatesController } from './staff-task-templates.controller';
import { StaffTaskTemplatesService } from './staff-task-templates.service';
import { StaffTeamChatController } from './staff-team-chat.controller';
import { StaffTeamChatService } from './staff-team-chat.service';
import { StaffTrainingCoursesController } from './staff-training-courses.controller';
import { StaffTrainingCoursesService } from './staff-training-courses.service';
import { StaffTasksController } from './staff-tasks.controller';
import { StaffTasksService } from './staff-tasks.service';

@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [
    StaffTasksController,
    StaffTaskTemplatesController,
    StaffKnowledgeBaseController,
    StaffTrainingCoursesController,
    StaffOnboardingPlansController,
    StaffShiftRegulationsController,
    StaffChecklistTemplatesController,
    StaffChecklistsController,
    StaffTeamChatController,
  ],
  providers: [
    StaffTasksService,
    StaffTaskTemplatesService,
    StaffKnowledgeBaseService,
    StaffTrainingCoursesService,
    StaffOnboardingPlansService,
    StaffShiftRegulationsService,
    StaffChecklistTemplatesService,
    StaffChecklistsService,
    StaffTeamChatService,
  ],
})
export class StaffModule {}

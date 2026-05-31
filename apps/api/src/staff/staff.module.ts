import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { StaffAssessmentsController } from './staff-assessments.controller';
import { StaffAssessmentsService } from './staff-assessments.service';
import { StaffAttachmentsController } from './staff-attachments.controller';
import { StaffAttachmentsService } from './staff-attachments.service';
import { StaffChecklistTemplatesController } from './staff-checklist-templates.controller';
import { StaffChecklistTemplatesService } from './staff-checklist-templates.service';
import { StaffChecklistsController } from './staff-checklists.controller';
import { StaffChecklistsService } from './staff-checklists.service';
import {
  StaffAdministratorRatingsController,
  StaffDisciplineController,
} from './staff-discipline.controller';
import { StaffDisciplineService } from './staff-discipline.service';
import { StaffKnowledgeBaseController } from './staff-knowledge-base.controller';
import { StaffKnowledgeBaseService } from './staff-knowledge-base.service';
import { StaffOnboardingPlansController } from './staff-onboarding-plans.controller';
import { StaffOnboardingPlansService } from './staff-onboarding-plans.service';
import { StaffOperationsDashboardController } from './staff-operations-dashboard.controller';
import { StaffOperationsDashboardService } from './staff-operations-dashboard.service';
import { StaffReadinessReportController } from './staff-readiness-report.controller';
import { StaffReadinessReportService } from './staff-readiness-report.service';
import { StaffSalaryController } from './staff-salary.controller';
import { StaffSalaryService } from './staff-salary.service';
import { StaffShiftRegulationsController } from './staff-shift-regulations.controller';
import { StaffShiftRegulationsService } from './staff-shift-regulations.service';
import { StaffTaskTemplatesController } from './staff-task-templates.controller';
import { StaffTaskTemplatesService } from './staff-task-templates.service';
import { StaffTeamChatController } from './staff-team-chat.controller';
import { StaffTeamChatService } from './staff-team-chat.service';
import { StaffTrainingCoursesController } from './staff-training-courses.controller';
import { StaffTrainingCoursesService } from './staff-training-courses.service';
import { StaffTrainingProfilesController } from './staff-training-profiles.controller';
import { StaffTrainingProfilesService } from './staff-training-profiles.service';
import { StaffTasksController } from './staff-tasks.controller';
import { StaffTasksService } from './staff-tasks.service';

@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [
    StaffTasksController,
    StaffTaskTemplatesController,
    StaffKnowledgeBaseController,
    StaffTrainingCoursesController,
    StaffTrainingProfilesController,
    StaffReadinessReportController,
    StaffOperationsDashboardController,
    StaffOnboardingPlansController,
    StaffAssessmentsController,
    StaffAttachmentsController,
    StaffShiftRegulationsController,
    StaffChecklistTemplatesController,
    StaffChecklistsController,
    StaffTeamChatController,
    StaffDisciplineController,
    StaffAdministratorRatingsController,
    StaffSalaryController,
  ],
  providers: [
    StaffTasksService,
    StaffTaskTemplatesService,
    StaffKnowledgeBaseService,
    StaffTrainingCoursesService,
    StaffTrainingProfilesService,
    StaffReadinessReportService,
    StaffOperationsDashboardService,
    StaffOnboardingPlansService,
    StaffAssessmentsService,
    StaffAttachmentsService,
    StaffShiftRegulationsService,
    StaffChecklistTemplatesService,
    StaffChecklistsService,
    StaffTeamChatService,
    StaffDisciplineService,
    StaffSalaryService,
  ],
})
export class StaffModule {}

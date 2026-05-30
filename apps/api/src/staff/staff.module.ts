import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { StaffChecklistsController } from './staff-checklists.controller';
import { StaffChecklistsService } from './staff-checklists.service';
import { StaffShiftRegulationsController } from './staff-shift-regulations.controller';
import { StaffShiftRegulationsService } from './staff-shift-regulations.service';
import { StaffTasksController } from './staff-tasks.controller';
import { StaffTasksService } from './staff-tasks.service';

@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [
    StaffTasksController,
    StaffShiftRegulationsController,
    StaffChecklistsController,
  ],
  providers: [
    StaffTasksService,
    StaffShiftRegulationsService,
    StaffChecklistsService,
  ],
})
export class StaffModule {}

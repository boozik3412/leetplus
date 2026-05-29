import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { StaffTasksController } from './staff-tasks.controller';
import { StaffTasksService } from './staff-tasks.service';

@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [StaffTasksController],
  providers: [StaffTasksService],
})
export class StaffModule {}

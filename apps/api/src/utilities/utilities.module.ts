import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ProductParsingController } from './product-parsing.controller';
import { ProductParsingService } from './product-parsing.service';

@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [ProductParsingController],
  providers: [ProductParsingService],
})
export class UtilitiesModule {}

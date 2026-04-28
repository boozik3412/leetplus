import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FactCsvImportService } from './fact-csv-import.service';
import { ImportsController } from './imports.controller';
import { ProductCsvImportService } from './product-csv-import.service';

@Module({
  imports: [AuthModule],
  controllers: [ImportsController],
  providers: [ProductCsvImportService, FactCsvImportService],
})
export class ImportsModule {}

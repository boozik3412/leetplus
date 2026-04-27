import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { ProductCsvImportDto } from './imports.dto';
import { ProductCsvImportService } from './product-csv-import.service';

@Controller('imports')
@UseGuards(JwtAuthGuard)
export class ImportsController {
  constructor(
    private readonly productCsvImportService: ProductCsvImportService,
  ) {}

  @Post('products/preview')
  previewProducts(
    @Body() dto: ProductCsvImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productCsvImportService.preview(dto.csv, user);
  }

  @Post('products')
  importProducts(
    @Body() dto: ProductCsvImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productCsvImportService.import(dto.csv, user);
  }
}

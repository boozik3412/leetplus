import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { ProductCsvImportDto } from './imports.dto';
import { FactCsvImportService } from './fact-csv-import.service';
import { ProductCsvImportService } from './product-csv-import.service';

@Controller('imports')
@UseGuards(JwtAuthGuard)
export class ImportsController {
  constructor(
    private readonly productCsvImportService: ProductCsvImportService,
    private readonly factCsvImportService: FactCsvImportService,
  ) {}

  @Get()
  findRecent(@CurrentUser() user: AuthenticatedUser) {
    return this.productCsvImportService.findRecent(user);
  }

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
    return this.productCsvImportService.import(
      dto.csv,
      user,
      dto.sourceFileName,
    );
  }

  @Post('inventory/preview')
  previewInventory(
    @Body() dto: ProductCsvImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factCsvImportService.previewInventory(dto.csv, user);
  }

  @Post('inventory')
  importInventory(
    @Body() dto: ProductCsvImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factCsvImportService.importInventory(
      dto.csv,
      user,
      dto.sourceFileName,
    );
  }

  @Post('sales/preview')
  previewSales(
    @Body() dto: ProductCsvImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factCsvImportService.previewSales(dto.csv, user);
  }

  @Post('sales')
  importSales(
    @Body() dto: ProductCsvImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factCsvImportService.importSales(
      dto.csv,
      user,
      dto.sourceFileName,
    );
  }

  @Post('movements/preview')
  previewStockMovements(
    @Body() dto: ProductCsvImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factCsvImportService.previewStockMovements(dto.csv, user);
  }

  @Post('movements')
  importStockMovements(
    @Body() dto: ProductCsvImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factCsvImportService.importStockMovements(
      dto.csv,
      user,
      dto.sourceFileName,
    );
  }
}

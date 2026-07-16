import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductCategoryCatalogService } from './product-category-catalog.service';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, ProductCategoryCatalogService],
})
export class CategoriesModule {}

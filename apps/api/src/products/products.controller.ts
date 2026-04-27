import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(OptionalJwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(@CurrentUser() user?: AuthenticatedUser) {
    return this.productsService.findAll(user);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.productsService.findById(id, user);
  }
}

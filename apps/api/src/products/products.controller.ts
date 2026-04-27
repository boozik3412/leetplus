import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProductsService } from './products.service';
import type { CreateProductDto, UpdateProductDto } from './products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async findAll(@CurrentUser() user?: AuthenticatedUser) {
    return this.productsService.findAll(user);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.productsService.findById(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.create(dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.update(id, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.archive(id, user);
  }
}

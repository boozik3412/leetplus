import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProductsService } from './products.service';
import type {
  AssignProductsCategoryDto,
  CreateProductDto,
  ProductCatalogQuery,
  UpdateProductDto,
} from './products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('summary')
  async getSummary(@CurrentUser() user?: AuthenticatedUser) {
    return this.productsService.getSummary(user);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('catalog')
  async getCatalog(
    @Query() query: ProductCatalogQuery,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.productsService.getCatalog(query, user);
  }

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

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.BUYER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.create(dto, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.BUYER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch('bulk-category')
  assignCategoryToUncategorizedProducts(
    @Body() dto: AssignProductsCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.assignCategoryToUncategorizedProducts(
      dto,
      user,
    );
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.BUYER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.update(id, dto, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.BUYER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.archive(id, user);
  }
}

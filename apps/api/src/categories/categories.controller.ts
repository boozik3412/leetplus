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
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CategoriesService } from './categories.service';
import type {
  ApplyCategorySourceMappingsDto,
  CreateCategoryDto,
  MergeCategoriesDto,
  PreviewCategorySourceMappingsDto,
  UpdateCategoryDto,
} from './categories.dto';
import { ProductCategoryCatalogService } from './product-category-catalog.service';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly productCategoryCatalogService: ProductCategoryCatalogService,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user?: AuthenticatedUser) {
    return this.categoriesService.findAll(user);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('langame/overview')
  getLangameOverview(@CurrentUser() user?: AuthenticatedUser) {
    return this.productCategoryCatalogService.getLangameOverview(user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('langame/preview')
  previewLangameMappings(
    @Body() dto: PreviewCategorySourceMappingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productCategoryCatalogService.previewLangameMappings(dto, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('langame/apply')
  applyLangameMappings(
    @Body() dto: ApplyCategorySourceMappingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productCategoryCatalogService.applyLangameMappings(dto, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('langame/refresh')
  refreshLangameCatalog(@CurrentUser() user: AuthenticatedUser) {
    return this.productCategoryCatalogService.refreshLangameCatalog(user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('merge')
  merge(
    @Body() dto: MergeCategoriesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoriesService.merge(dto, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoriesService.create(dto, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoriesService.update(id, dto, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.categoriesService.remove(id, user);
  }
}

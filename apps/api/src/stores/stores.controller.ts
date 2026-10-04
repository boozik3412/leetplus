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
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StoresService } from './stores.service';
import { StoreClosuresService } from './store-closures.service';
import type { CreateStoreDto, UpdateStoreDto } from './stores.dto';
import type {
  CreateStoreClosureDto,
  UpdateStoreClosureDto,
} from './store-closures.dto';

const TENANT_USER_ROLES = Object.values(UserRole);

@Controller('stores')
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly storeClosuresService: StoreClosuresService,
  ) {}

  @Roles(...TENANT_USER_ROLES)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.storesService.findAll(user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  create(@Body() dto: CreateStoreDto, @CurrentUser() user: AuthenticatedUser) {
    return this.storesService.create(dto, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('address-suggestions')
  suggestAddresses(@Query('q') query?: string) {
    return this.storesService.suggestAddresses(query);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('address-geocode')
  geocodeAddress(@Query('q') query?: string) {
    return this.storesService.geocodeAddress(query);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('yandex-maps-geocode')
  geocodeYandexMapsLink(@Query('q') query?: string) {
    return this.storesService.geocodeYandexMapsLink(query);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('address-geocode/missing')
  geocodeMissingStoreCoordinates(@CurrentUser() user: AuthenticatedUser) {
    return this.storesService.geocodeMissingStoreCoordinates(user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('closures')
  listClosures(@CurrentUser() user: AuthenticatedUser) {
    return this.storeClosuresService.list(user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/closures')
  createClosure(
    @Param('id') id: string,
    @Body() dto: CreateStoreClosureDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeClosuresService.create(id, dto, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id/closures/:closureId')
  updateClosure(
    @Param('id') id: string,
    @Param('closureId') closureId: string,
    @Body() dto: UpdateStoreClosureDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeClosuresService.update(id, closureId, dto, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id/closures/:closureId')
  removeClosure(
    @Param('id') id: string,
    @Param('closureId') closureId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storeClosuresService.remove(id, closureId, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storesService.update(id, dto, user);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.storesService.archive(id, user);
  }
}

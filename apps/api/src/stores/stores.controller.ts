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
import { StoresService } from './stores.service';
import type { CreateStoreDto, UpdateStoreDto } from './stores.dto';

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user?: AuthenticatedUser) {
    return this.storesService.findAll(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateStoreDto, @CurrentUser() user: AuthenticatedUser) {
    return this.storesService.create(dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.storesService.update(id, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.storesService.archive(id, user);
  }
}

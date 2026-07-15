import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  GUEST_GAME_MEDIA_MAX_BYTES,
  GuestGameMediaService,
  type GuestGameMediaUploadFile,
} from './guest-game-media.service';

@Controller('guests/gamification/media')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.MARKETER,
  UserRole.CLUB_MANAGER,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuestGameMediaController {
  constructor(private readonly mediaService: GuestGameMediaService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: GUEST_GAME_MEDIA_MAX_BYTES },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: GuestGameMediaUploadFile,
  ) {
    return this.mediaService.createAsset(user, file);
  }
}

@Controller('public/guest-game/media')
export class GuestGamePublicMediaController {
  constructor(private readonly mediaService: GuestGameMediaService) {}

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async read(@Param('id') id: string): Promise<StreamableFile> {
    const asset = await this.mediaService.getAsset(id);
    return new StreamableFile(asset.buffer, {
      type: asset.contentType,
      disposition: 'inline',
      length: asset.buffer.length,
    });
  }
}

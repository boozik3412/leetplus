import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

export const GUEST_GAME_MEDIA_MAX_BYTES = 2 * 1024 * 1024;

export type GuestGameMediaUploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

@Injectable()
export class GuestGameMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async createAsset(
    user: AuthenticatedUser,
    file: GuestGameMediaUploadFile | undefined,
  ) {
    const buffer = file?.buffer;
    if (!buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    if (buffer.length > GUEST_GAME_MEDIA_MAX_BYTES) {
      throw new BadRequestException('Image file is too large');
    }

    const contentType = detectImageContentType(buffer);
    if (!contentType) {
      throw new BadRequestException(
        'Only JPG, PNG and WebP images are allowed',
      );
    }

    const tenant = await this.tenantContextService.resolve(user);
    const asset = await this.prisma.guestGameMediaAsset.create({
      data: {
        tenantId: tenant.tenantId,
        uploadedByUserId: user.id,
        fileName: normalizeFileName(file?.originalname),
        contentType,
        byteSize: buffer.length,
        data: Uint8Array.from(buffer),
      },
      select: {
        id: true,
        fileName: true,
        contentType: true,
        byteSize: true,
        createdAt: true,
      },
    });

    return {
      ...asset,
      createdAt: asset.createdAt.toISOString(),
      url: `/public/guest-game/media/${asset.id}`,
    };
  }

  async getAsset(id: string) {
    const asset = await this.prisma.guestGameMediaAsset.findUnique({
      where: { id },
      select: {
        fileName: true,
        contentType: true,
        data: true,
      },
    });

    if (!asset) {
      throw new NotFoundException('Image not found');
    }

    return {
      fileName: asset.fileName,
      contentType: asset.contentType,
      buffer: Buffer.from(asset.data),
    };
  }
}

export function detectImageContentType(buffer: Buffer) {
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function normalizeFileName(value: string | null | undefined) {
  const normalized = (value ?? 'quest-cover')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return normalized || 'quest-cover';
}

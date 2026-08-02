import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  STAFF_ATTACHMENT_MAX_BYTES,
  StaffAttachmentsService,
  type StaffAttachmentUploadFile,
} from './staff-attachments.service';

const SAFE_INLINE_ATTACHMENT_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

@Controller('staff/attachments')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
  UserRole.TRAINEE,
)
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffAttachmentsController {
  constructor(
    private readonly staffAttachmentsService: StaffAttachmentsService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: STAFF_ATTACHMENT_MAX_BYTES },
    }),
  )
  uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: StaffAttachmentUploadFile,
  ) {
    return this.staffAttachmentsService.createAttachment(user, file);
  }

  @Get(':id')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.staffAttachmentsService.getAttachment(user, id);

    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Vary', 'Authorization, Cookie');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: this.contentDisposition(file.fileName, file.contentType),
      length: file.buffer.length,
    });
  }

  private contentDisposition(fileName: string, contentType: string) {
    const fallback = fileName.replace(/[^\x20-\x7E]+/g, '_').replace(/"/g, '');
    const encoded = encodeURIComponent(fileName);
    const normalizedType = contentType.split(';', 1)[0]?.trim().toLowerCase();
    const mode =
      normalizedType &&
      SAFE_INLINE_ATTACHMENT_CONTENT_TYPES.has(normalizedType)
        ? 'inline'
        : 'attachment';

    return `${mode}; filename="${fallback || 'attachment'}"; filename*=UTF-8''${encoded}`;
  }
}

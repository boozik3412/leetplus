import {
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
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

@Controller('staff/attachments')
@Roles(
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
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
  ): Promise<StreamableFile> {
    const file = await this.staffAttachmentsService.getAttachment(user, id);

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: this.contentDisposition(file.fileName),
      length: file.buffer.length,
    });
  }

  private contentDisposition(fileName: string) {
    const fallback = fileName.replace(/[^\x20-\x7E]+/g, '_').replace(/"/g, '');
    const encoded = encodeURIComponent(fileName);

    return `inline; filename="${fallback || 'attachment'}"; filename*=UTF-8''${encoded}`;
  }
}

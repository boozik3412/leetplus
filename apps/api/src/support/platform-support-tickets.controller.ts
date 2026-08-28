import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  SupportTicketsService,
  type SupportTicketCommentDto,
  type SupportTicketsQuery,
  type SupportTicketUpdateDto,
} from './support-tickets.service';
import { setAttachmentHeaders } from './support-tickets.controller';

@Controller('admin/support-tickets')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PlatformSupportTicketsController {
  constructor(private readonly service: SupportTicketsService) {}

  @Get()
  getTickets(@Query() query: SupportTicketsQuery) {
    return this.service.getPlatformTickets(query);
  }

  @Patch(':id')
  updateTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SupportTicketUpdateDto,
  ) {
    return this.service.updatePlatformTicket(user, id, dto);
  }

  @Post(':id/comments')
  addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SupportTicketCommentDto,
  ) {
    return this.service.addPlatformComment(user, id, dto);
  }

  @Get(':id/attachments/:attachmentId')
  async getAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.getPlatformAttachment(id, attachmentId);
    setAttachmentHeaders(response, file.fileName, file.contentType);
    return new StreamableFile(file.data, { length: file.byteSize });
  }
}

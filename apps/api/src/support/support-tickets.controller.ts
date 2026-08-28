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
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FreshNetworkScopeGuard } from '../tenancy/fresh-network-scope.guard';
import {
  SupportTicketsService,
  type SupportTicketCommentDto,
  type SupportTicketsQuery,
  type SupportTicketUpdateDto,
} from './support-tickets.service';

@Controller('support/bug-reports')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard, FreshNetworkScopeGuard)
export class SupportTicketsController {
  constructor(private readonly service: SupportTicketsService) {}

  @Get()
  getTickets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SupportTicketsQuery,
  ) {
    return this.service.getTenantTickets(user, query);
  }

  @Patch(':id')
  updateTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SupportTicketUpdateDto,
  ) {
    return this.service.updateTenantTicket(user, id, dto);
  }

  @Post(':id/comments')
  addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SupportTicketCommentDto,
  ) {
    return this.service.addTenantComment(user, id, dto);
  }

  @Get(':id/attachments/:attachmentId')
  async getAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.getTenantAttachment(user, id, attachmentId);
    setAttachmentHeaders(response, file.fileName, file.contentType);
    return new StreamableFile(file.data, { length: file.byteSize });
  }
}

export function setAttachmentHeaders(
  response: Response,
  fileName: string,
  contentType: string,
) {
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  response.setHeader('Content-Type', contentType);
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="bug-attachment"; filename*=UTF-8''${encoded}`,
  );
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
}

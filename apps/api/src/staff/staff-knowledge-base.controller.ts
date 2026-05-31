import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  StaffKnowledgeBaseService,
  type StaffKnowledgeArticleDto,
  type StaffKnowledgeBaseQuery,
  type StaffKnowledgeBaseReport,
  type StaffKnowledgeReadReceiptDto,
} from './staff-knowledge-base.service';

@Controller('staff/knowledge-base')
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
export class StaffKnowledgeBaseController {
  constructor(
    private readonly staffKnowledgeBaseService: StaffKnowledgeBaseService,
  ) {}

  @Get()
  getArticles(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffKnowledgeBaseQuery,
  ): Promise<StaffKnowledgeBaseReport> {
    return this.staffKnowledgeBaseService.getArticles(user, query);
  }

  @Post()
  createArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StaffKnowledgeArticleDto,
  ) {
    return this.staffKnowledgeBaseService.createArticle(user, dto);
  }

  @Patch(':id')
  updateArticle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffKnowledgeArticleDto,
  ) {
    return this.staffKnowledgeBaseService.updateArticle(user, id, dto);
  }

  @Post(':id/read-receipts')
  markArticleRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: StaffKnowledgeReadReceiptDto,
  ) {
    return this.staffKnowledgeBaseService.markArticleRead(user, id, dto);
  }
}

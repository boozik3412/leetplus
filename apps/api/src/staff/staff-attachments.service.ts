import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

export const STAFF_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export type StaffAttachmentUploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

export type StaffAttachmentResponse = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  url: string;
  createdAt: string;
  uploadedByUser: { id: string; email: string; fullName: string | null } | null;
};

export type StaffAttachmentFile = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

const attachmentSelect = {
  id: true,
  fileName: true,
  contentType: true,
  byteSize: true,
  createdAt: true,
  uploadedByUser: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.StaffAttachmentSelect;

type StaffAttachmentRow = Prisma.StaffAttachmentGetPayload<{
  select: typeof attachmentSelect;
}>;

@Injectable()
export class StaffAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async createAttachment(
    user: AuthenticatedUser,
    file: StaffAttachmentUploadFile | undefined,
  ): Promise<StaffAttachmentResponse> {
    const tenant = await this.tenantContextService.resolve(user);
    const buffer = file?.buffer;

    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('File is required');
    }

    if (buffer.length > STAFF_ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('File is too large');
    }

    const fileName = this.normalizeFileName(file?.originalname);
    const contentType = this.normalizeContentType(file?.mimetype);

    const row = await this.prisma.staffAttachment.create({
      data: {
        tenantId: tenant.tenantId,
        uploadedByUserId: user.id,
        fileName,
        contentType,
        byteSize: buffer.length,
        data: Uint8Array.from(buffer),
      },
      select: attachmentSelect,
    });

    return this.toResponse(row);
  }

  async getAttachment(
    user: AuthenticatedUser,
    id: string,
  ): Promise<StaffAttachmentFile> {
    const tenant = await this.tenantContextService.resolve(user);
    const row = await this.prisma.staffAttachment.findFirst({
      where: { id, tenantId: tenant.tenantId },
      select: {
        fileName: true,
        contentType: true,
        data: true,
      },
    });

    if (!row) {
      throw new NotFoundException('Attachment not found');
    }

    return {
      fileName: row.fileName,
      contentType: row.contentType,
      buffer: Buffer.from(row.data),
    };
  }

  private normalizeFileName(value: string | null | undefined) {
    const normalized = (value ?? 'attachment')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);

    return normalized || 'attachment';
  }

  private normalizeContentType(value: string | null | undefined) {
    const normalized = (value ?? 'application/octet-stream')
      .trim()
      .slice(0, 120);

    return normalized || 'application/octet-stream';
  }

  private toResponse(row: StaffAttachmentRow): StaffAttachmentResponse {
    return {
      id: row.id,
      fileName: row.fileName,
      contentType: row.contentType,
      byteSize: row.byteSize,
      url: `/staff/attachments/${row.id}`,
      createdAt: row.createdAt.toISOString(),
      uploadedByUser: row.uploadedByUser,
    };
  }
}

import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StaffAttachmentsController } from './staff-attachments.controller';
import type { StaffAttachmentsService } from './staff-attachments.service';

const user: AuthenticatedUser = {
  id: 'user-a1',
  email: 'user-a1@example.test',
  fullName: 'User A1',
  role: UserRole.CLUB_MANAGER,
  isPlatformAdmin: false,
  tenantId: 'tenant-a',
  tenantSlug: 'tenant-a',
  accessScope: 'STORES',
  allowedStoreIds: ['store-a1'],
};

describe('StaffAttachmentsController', () => {
  function createSubject(contentType: string) {
    const service = {
      getAttachment: jest.fn().mockResolvedValue({
        fileName: 'evidence.svg',
        contentType,
        buffer: Buffer.from('attachment'),
      }),
    };
    const setHeader = jest.fn();
    const response = {
      setHeader,
    } as unknown as Response;
    const controller = new StaffAttachmentsController(
      service as unknown as StaffAttachmentsService,
    );

    return { controller, response, setHeader };
  }

  it('forces active and unknown content types to download', async () => {
    const { controller, response } = createSubject('image/svg+xml');

    const result = await controller.downloadAttachment(
      user,
      'attachment-1',
      response,
    );

    const headers = result.getHeaders();
    expect(headers.type).toBe('image/svg+xml');
    expect(headers.disposition).toMatch(/^attachment;/);
    expect(headers.length).toBe(10);
  });

  it('allows a bounded safe type inline and emits private response headers', async () => {
    const { controller, response, setHeader } = createSubject('image/png');

    const result = await controller.downloadAttachment(
      user,
      'attachment-1',
      response,
    );

    const headers = result.getHeaders();
    expect(headers.type).toBe('image/png');
    expect(headers.disposition).toMatch(/^inline;/);
    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store, max-age=0',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Cross-Origin-Resource-Policy',
      'same-origin',
    );
  });
});

import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  let service: TenantContextService;

  beforeEach(() => {
    service = new TenantContextService();
  });

  it('uses authenticated user tenant when available', () => {
    expect(
      service.resolve({
        id: 'user-1',
        email: 'owner@example.com',
        fullName: null,
        role: UserRole.OWNER,
        tenantId: 'tenant-user',
        tenantSlug: 'club-a',
      }),
    ).toEqual({
      tenantId: 'tenant-user',
      tenantSlug: 'club-a',
    });
  });

  it('fails closed when authenticated user context is missing', () => {
    expect(() => service.resolve()).toThrow(UnauthorizedException);
  });
});

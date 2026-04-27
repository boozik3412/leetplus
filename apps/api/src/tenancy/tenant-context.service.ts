import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

const DEMO_TENANT_SLUG = 'demo' as const;

export type TenantContext = {
  tenantId: string;
  tenantSlug: string;
};

@Injectable()
export class TenantContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(user?: AuthenticatedUser): Promise<TenantContext> {
    if (user) {
      return {
        tenantId: user.tenantId,
        tenantSlug: user.tenantSlug,
      };
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: DEMO_TENANT_SLUG },
      select: {
        id: true,
        slug: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Tenant with slug "${DEMO_TENANT_SLUG}" not found`,
      );
    }

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    };
  }
}

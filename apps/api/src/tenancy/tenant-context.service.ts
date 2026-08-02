import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';

export type TenantContext = {
  tenantId: string;
  tenantSlug: string;
};

@Injectable()
export class TenantContextService {
  resolve(user?: AuthenticatedUser): TenantContext {
    if (!user) {
      throw new UnauthorizedException(
        'Authenticated tenant context is required',
      );
    }

    return {
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug,
    };
  }
}

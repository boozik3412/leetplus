import { UserRole } from '@prisma/client';
import { Request } from 'express';

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive?: boolean;
  isPlatformAdmin: boolean;
  tenantId: string;
  tenantSlug: string;
};

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
  isPlatformAdmin: boolean;
  tenantId: string;
  tenantSlug: string;
};

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

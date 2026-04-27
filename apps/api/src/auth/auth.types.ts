import { UserRole } from '@prisma/client';
import { Request } from 'express';

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  tenantId: string;
  tenantSlug: string;
};

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
  tenantId: string;
  tenantSlug: string;
};

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

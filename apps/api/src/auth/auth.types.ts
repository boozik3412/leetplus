import { UserRole } from '@prisma/client';
import { Request } from 'express';
import type { AccessCapability } from './capabilities';

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  customRoleId?: string | null;
  customRoleName?: string | null;
  hasRoleOverride?: boolean;
  permissions?: AccessCapability[];
  isActive?: boolean;
  isPlatformAdmin: boolean;
  tenantId: string;
  tenantSlug: string;
  tenantStatus?: string;
};

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
  customRoleId?: string | null;
  permissions?: AccessCapability[];
  isPlatformAdmin: boolean;
  tenantId: string;
  tenantSlug: string;
};

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

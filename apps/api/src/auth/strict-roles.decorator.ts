import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const STRICT_ROLES_KEY = 'strict_roles';

export const StrictRoles = (...roles: UserRole[]) =>
  SetMetadata(STRICT_ROLES_KEY, roles);

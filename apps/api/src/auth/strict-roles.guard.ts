import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from './auth.types';
import { STRICT_ROLES_KEY } from './strict-roles.decorator';

@Injectable()
export class StrictRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const allowedRoles =
      this.reflector.getAllAndOverride<UserRole[]>(STRICT_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (allowedRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role;

    if (role && allowedRoles.includes(role)) {
      return true;
    }

    throw new ForbiddenException('Insufficient role permissions');
  }
}

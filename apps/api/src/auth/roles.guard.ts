import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from './auth.types';
import { AccessCapability, hasCapability } from './capabilities';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const allowedRoles =
      this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
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

    const capability = this.resolveRequiredCapability(request);

    if (capability && hasCapability(request.user, capability)) {
      return true;
    }

    throw new ForbiddenException('Insufficient role permissions');
  }

  private resolveRequiredCapability(
    request: AuthenticatedRequest,
  ): AccessCapability | null {
    const path = this.normalizePath(request);
    const method = request.method?.toUpperCase() ?? 'GET';

    if (path.startsWith('/users')) {
      return 'manage_users';
    }

    if (path.startsWith('/integrations/langame/settings')) {
      return 'manage_integrations';
    }

    if (
      path.startsWith('/integrations/langame/sync') ||
      path.startsWith('/integrations/langame/guests/foundation/sync')
    ) {
      return 'run_sync';
    }

    if (path.startsWith('/imports')) {
      return 'import_data';
    }

    if (path.startsWith('/utilities')) {
      return 'use_utilities';
    }

    if (path.startsWith('/reports')) {
      return 'view_reports';
    }

    if (path.startsWith('/products')) {
      return method === 'GET' ? 'view_reports' : 'edit_products';
    }

    if (path.startsWith('/categories') || path.startsWith('/suppliers')) {
      return method === 'GET' ? 'view_reports' : 'edit_catalog';
    }

    if (path.startsWith('/stores')) {
      return method === 'GET' ? 'view_reports' : 'edit_stores';
    }

    if (path.startsWith('/guests/staff-control')) {
      return 'view_staff';
    }

    if (path.startsWith('/guests')) {
      return 'view_guests';
    }

    if (path.startsWith('/marketing')) {
      return 'view_marketing';
    }

    if (path.startsWith('/staff')) {
      return 'view_staff';
    }

    return null;
  }

  private normalizePath(request: AuthenticatedRequest) {
    const rawPath =
      (request as { path?: string }).path ??
      request.url?.split('?')[0] ??
      request.originalUrl?.split('?')[0] ??
      '';

    if (!rawPath) {
      return '';
    }

    return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  }
}

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

    if (role && this.isRestrictedShiftStaffPath(request, role)) {
      throw new ForbiddenException('Insufficient role permissions');
    }

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
      return 'view_assortment_reports';
    }

    if (path.startsWith('/products')) {
      return method === 'GET' ? 'view_assortment_products' : 'edit_products';
    }

    if (path.startsWith('/categories') || path.startsWith('/suppliers')) {
      return method === 'GET' ? 'view_assortment_catalog' : 'edit_catalog';
    }

    if (path.startsWith('/stores')) {
      return method === 'GET' ? 'view_assortment_stores' : 'edit_stores';
    }

    if (path.startsWith('/guests/gamification')) {
      return this.resolveGuestGamificationCapability(path, method);
    }

    if (path.startsWith('/guests/staff-control')) {
      return 'view_staff_control';
    }

    if (path.startsWith('/guests')) {
      return 'view_guests';
    }

    if (path.startsWith('/marketing')) {
      return 'view_marketing';
    }

    if (
      path.startsWith('/staff/team-chat') ||
      path.startsWith('/staff/notifications')
    ) {
      return 'view_communications';
    }

    if (path.startsWith('/staff')) {
      return this.resolveStaffCapability(path);
    }

    return null;
  }

  private resolveStaffCapability(path: string): AccessCapability {
    if (
      path.startsWith('/staff/team-chat') ||
      path.startsWith('/staff/notifications')
    ) {
      return 'view_communications';
    }

    if (path.startsWith('/staff/shift-workspace')) {
      return 'view_staff_shift_workspace';
    }

    if (
      path.startsWith('/staff/tasks') ||
      path.startsWith('/staff/task-rules') ||
      path.startsWith('/staff/task-templates')
    ) {
      return 'view_staff_tasks';
    }

    if (
      path.startsWith('/staff/shift-regulations') ||
      path.startsWith('/staff/checklists') ||
      path.startsWith('/staff/checklist-templates') ||
      path.startsWith('/staff/attachments')
    ) {
      return 'view_staff_standards';
    }

    if (
      path.startsWith('/staff/training-courses') ||
      path.startsWith('/staff/training-profiles') ||
      path.startsWith('/staff/readiness-report') ||
      path.startsWith('/staff/onboarding') ||
      path.startsWith('/staff/assessments')
    ) {
      return 'view_staff_training';
    }

    if (path.startsWith('/staff/knowledge-base')) {
      return 'view_staff_knowledge';
    }

    if (
      path.startsWith('/staff/operations-dashboard') ||
      path.startsWith('/staff/administrator-ratings') ||
      path.startsWith('/staff/discipline') ||
      path.startsWith('/staff/ai-assistant')
    ) {
      return 'view_staff_control';
    }

    if (path.startsWith('/staff/directory')) {
      return 'view_staff_directory';
    }

    if (path.startsWith('/staff/salary')) {
      return 'view_staff_salary';
    }

    return 'view_staff';
  }

  private resolveGuestGamificationCapability(
    path: string,
    method: string,
  ): AccessCapability {
    if (method === 'GET') {
      if (path.startsWith('/guests/gamification/rewards/export')) {
        return 'approve_guest_game_rewards';
      }

      return 'view_guest_gamification';
    }

    if (path.startsWith('/guests/gamification/rewards')) {
      return 'approve_guest_game_rewards';
    }

    if (
      path.startsWith('/guests/gamification/dry-run') ||
      path.startsWith('/guests/gamification/facts')
    ) {
      return 'view_guest_gamification';
    }

    return 'manage_guest_game_rules';
  }

  private isRestrictedShiftStaffPath(
    request: AuthenticatedRequest,
    role: UserRole,
  ) {
    if (
      role !== UserRole.SENIOR_ADMINISTRATOR &&
      role !== UserRole.CLUB_ADMINISTRATOR
    ) {
      return false;
    }

    const path = this.normalizePath(request);

    if (!path.startsWith('/staff')) {
      return false;
    }

    const deniedPrefixes = [
      '/staff/checklists/report',
      '/staff/checklist-templates',
      '/staff/task-templates',
      '/staff/training-profiles',
      '/staff/readiness-report',
      '/staff/operations-dashboard',
      '/staff/administrator-ratings',
      '/staff/discipline',
      '/staff/salary',
      '/staff/directory',
      '/staff/onboarding',
      '/staff/ai-assistant',
    ];

    if (deniedPrefixes.some((prefix) => path.startsWith(prefix))) {
      return true;
    }

    const allowedPrefixes = [
      '/staff/tasks',
      '/staff/task-rules',
      '/staff/shift-regulations',
      '/staff/checklists',
      '/staff/training-courses',
      '/staff/assessments',
      '/staff/knowledge-base',
      '/staff/shift-workspace',
      '/staff/team-chat',
      '/staff/notifications',
      '/staff/attachments',
    ];

    return !allowedPrefixes.some((prefix) => path.startsWith(prefix));
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

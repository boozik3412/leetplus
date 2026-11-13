import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  StaffChecklistsService,
  type StaffChecklistRunResponse,
} from '../staff/staff-checklists.service';
import {
  StaffTasksService,
  type StaffTaskResponse,
} from '../staff/staff-tasks.service';
import { StoreFloorPlanLiveService } from './store-floor-plan-live.service';

/**
 * Roles that may switch «Схема клуба» to «Режим администратора смены»:
 * senior administrator, standards manager and above.
 */
export const SHIFT_ADMIN_VIEWER_ROLES: readonly UserRole[] = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
  UserRole.SENIOR_ADMINISTRATOR,
];

export type StoreFloorPlanShiftAdminWork = {
  storeId: string;
  generatedAt: string;
  /**
   * READY: the shift administrator has a LeetPlus account, checklists and
   * tasks below are theirs. NO_SHIFT: no open Langame shift. NOT_LINKED: the
   * Langame administrator is not linked to a LeetPlus account in the staff
   * card. NOT_CONNECTED / UNAVAILABLE: the club has no Langame or Langame
   * did not answer.
   */
  state: 'READY' | 'NO_SHIFT' | 'NOT_LINKED' | 'NOT_CONNECTED' | 'UNAVAILABLE';
  shiftStartedAt: string | null;
  /** `userId` is the LeetPlus account, for links to the staff sections. */
  admin: { name: string | null; userId: string | null; isMe: boolean } | null;
  /** `null` when the part could not be read; see the access fields. */
  checklists: StaffChecklistRunResponse[] | null;
  checklistAccess: 'AVAILABLE' | 'NO_CAPABILITY';
  tasks: StaffTaskResponse[] | null;
  taskTotal: number;
  taskAccess: 'AVAILABLE' | 'NO_CAPABILITY';
};

/**
 * «Режим администратора смены» of «Схема клуба»: the checklist and the tasks
 * of whoever holds the open Langame shift of the club, for a senior
 * administrator, a standards manager or above. The administrator is found
 * through the staff card link (Langame user id → staff member → LeetPlus
 * account); the viewer never chooses whose work is read.
 */
@Injectable()
export class StoreFloorPlanShiftAdminService {
  private readonly logger = new Logger(StoreFloorPlanShiftAdminService.name);

  constructor(
    private readonly live: StoreFloorPlanLiveService,
    private readonly checklists: StaffChecklistsService,
    private readonly tasks: StaffTasksService,
  ) {}

  async getShiftAdminWork(
    storeId: string,
    user: AuthenticatedUser,
    now = new Date(),
  ): Promise<StoreFloorPlanShiftAdminWork> {
    if (
      !user.isPlatformAdmin &&
      !SHIFT_ADMIN_VIEWER_ROLES.includes(user.role)
    ) {
      throw new ForbiddenException('Insufficient role permissions');
    }
    const shift = await this.live.shiftAdminOf(storeId, user, now);
    const result: StoreFloorPlanShiftAdminWork = {
      storeId: shift.store.id,
      generatedAt: now.toISOString(),
      state: 'READY',
      shiftStartedAt: shift.startedAt,
      admin: shift.admin
        ? {
            name: shift.admin.name,
            userId: shift.admin.userId,
            isMe: shift.admin.userId === user.id,
          }
        : null,
      checklists: null,
      checklistAccess: 'AVAILABLE',
      tasks: null,
      taskTotal: 0,
      taskAccess: 'AVAILABLE',
    };
    if (shift.status === 'NOT_CONNECTED') {
      return { ...result, state: 'NOT_CONNECTED' };
    }
    if (!shift.admin) {
      return {
        ...result,
        state:
          shift.failed || shift.status === 'UNAVAILABLE'
            ? 'UNAVAILABLE'
            : 'NO_SHIFT',
      };
    }
    const adminUserId = shift.admin.userId;
    if (!adminUserId) return { ...result, state: 'NOT_LINKED' };

    const [checklists, tasks] = await Promise.all([
      this.checklists
        .getShiftAdminRuns(user, shift.store.id, adminUserId, now)
        .then(
          (rows) => ({ ok: true as const, rows }),
          (error: unknown) => this.failure('checklists', error),
        ),
      this.tasks.getShiftAdminTasks(user, shift.store.id, adminUserId).then(
        (value) => ({ ok: true as const, ...value }),
        (error: unknown) => this.failure('tasks', error),
      ),
    ]);
    if (checklists.ok) result.checklists = checklists.rows;
    else if (checklists.forbidden) result.checklistAccess = 'NO_CAPABILITY';
    if (tasks.ok) {
      result.tasks = tasks.rows;
      result.taskTotal = tasks.total;
    } else if (tasks.forbidden) result.taskAccess = 'NO_CAPABILITY';
    return result;
  }

  private failure(part: string, error: unknown) {
    const forbidden = error instanceof ForbiddenException;
    if (!forbidden) {
      const reason = error instanceof Error ? error.name : 'unknown';
      this.logger.warn(`Shift admin ${part} read failed (${reason})`);
    }
    return { ok: false as const, forbidden };
  }
}

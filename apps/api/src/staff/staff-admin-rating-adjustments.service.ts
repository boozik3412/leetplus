import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { hasCapability } from '../auth/capabilities';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  ADMIN_RATING_FORGIVABLE_KINDS,
  ADMIN_RATING_RULES,
  type AdminRatingForgivableKind,
} from './staff-admin-rating';
import { ADMIN_RATING_ROLES } from './staff-admin-rating.service';

/** Who may forgive, reward or lower an administrator's rating. */
export const ADMIN_RATING_REVIEWER_ROLES = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CLUB_MANAGER,
  UserRole.STANDARDS_MANAGER,
] as const;

const REASON_MAX_LENGTH = 500;

export type StaffAdminRatingAdjustmentDto = {
  userId?: unknown;
  kind?: unknown;
  points?: unknown;
  targetKind?: unknown;
  targetId?: unknown;
  reason?: unknown;
  occurredAt?: unknown;
};

/**
 * A reviewer's decision on the administrator rating (staff-admin-rating.ts):
 * forgive one penalty item, or give a bonus / penalty of 1–10 points with a
 * reason. A decision is never edited; it is canceled and given again.
 */
@Injectable()
export class StaffAdminRatingAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  static canAdjust(user: AuthenticatedUser) {
    return (
      hasCapability(user, 'manage_staff_control') &&
      (user.isPlatformAdmin ||
        (ADMIN_RATING_REVIEWER_ROLES as readonly UserRole[]).includes(
          user.role,
        ))
    );
  }

  async create(user: AuthenticatedUser, dto: StaffAdminRatingAdjustmentDto) {
    this.assertCanAdjust(user);
    const { tenantId } = this.tenantContextService.resolve(user);
    const userId = requiredString(dto.userId, 'userId');
    const reason = requiredString(dto.reason, 'reason');
    if (reason.length > REASON_MAX_LENGTH) {
      throw new BadRequestException(
        `Причина длиннее ${REASON_MAX_LENGTH} символов`,
      );
    }
    if (userId === user.id) {
      throw new ForbiddenException('Свой рейтинг менять нельзя');
    }

    const target = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        role: { in: [...ADMIN_RATING_ROLES] },
      },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('Администратор не найден');
    }

    const kind = dto.kind;
    let data: Prisma.StaffAdminRatingAdjustmentUncheckedCreateInput;
    if (kind === 'FORGIVE') {
      const targetKind = forgivableKind(dto.targetKind);
      const targetId = requiredString(dto.targetId, 'targetId');
      await this.assertTargetBelongsTo(tenantId, userId, targetKind, targetId);
      data = {
        tenantId,
        userId,
        createdByUserId: user.id,
        kind,
        points: 0,
        targetKind,
        targetId,
        reason,
      };
    } else if (kind === 'BONUS' || kind === 'PENALTY') {
      const points = adjustmentPoints(dto.points);
      data = {
        tenantId,
        userId,
        createdByUserId: user.id,
        kind,
        points: kind === 'BONUS' ? points : -points,
        reason,
        occurredAt: occurredAt(dto.occurredAt),
      };
    } else {
      throw new BadRequestException('kind: FORGIVE, BONUS или PENALTY');
    }

    try {
      const created = await this.prisma.staffAdminRatingAdjustment.create({
        data,
        select: adjustmentSelect,
      });
      return toResponse(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Этот пункт уже прощён');
      }
      throw error;
    }
  }

  async cancel(user: AuthenticatedUser, id: string) {
    this.assertCanAdjust(user);
    const { tenantId } = this.tenantContextService.resolve(user);
    const updated = await this.prisma.staffAdminRatingAdjustment.updateMany({
      where: { id, tenantId, status: 'ACTIVE' },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
        canceledByUserId: user.id,
      },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Решение не найдено или уже отменено');
    }
    return { id, canceled: true };
  }

  private assertCanAdjust(user: AuthenticatedUser) {
    if (!StaffAdminRatingAdjustmentsService.canAdjust(user)) {
      throw new ForbiddenException(
        'Менять рейтинг может управляющий клубом, управляющий сети или владелец',
      );
    }
  }

  private async assertTargetBelongsTo(
    tenantId: string,
    userId: string,
    targetKind: AdminRatingForgivableKind,
    targetId: string,
  ) {
    let found: { id: string } | null = null;
    if (targetKind === 'CHECKLIST_ESCALATED') {
      found = await this.prisma.staffChecklistRun.findFirst({
        where: {
          id: targetId,
          tenantId,
          assignedToUserId: userId,
          OR: [{ escalatedAt: { not: null } }, { status: 'ESCALATED' }],
        },
        select: { id: true },
      });
    } else if (targetKind === 'FINE' || targetKind === 'WARNING') {
      found = await this.prisma.staffDisciplineRecord.findFirst({
        where: {
          id: targetId,
          tenantId,
          userId,
          level: { startsWith: targetKind },
        },
        select: { id: true },
      });
    } else {
      found = await this.prisma.staffTask.findFirst({
        where: { id: targetId, tenantId, assignedToUserId: userId },
        select: { id: true },
      });
    }
    if (!found) {
      throw new NotFoundException('Пункт рейтинга не найден');
    }
  }
}

const adjustmentSelect = {
  id: true,
  userId: true,
  kind: true,
  points: true,
  targetKind: true,
  targetId: true,
  reason: true,
  occurredAt: true,
  status: true,
} satisfies Prisma.StaffAdminRatingAdjustmentSelect;

function toResponse(
  row: Prisma.StaffAdminRatingAdjustmentGetPayload<{
    select: typeof adjustmentSelect;
  }>,
) {
  return { ...row, occurredAt: row.occurredAt.toISOString() };
}

function requiredString(value: unknown, field: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new BadRequestException(`${field} обязателен`);
  }
  return text;
}

function forgivableKind(value: unknown): AdminRatingForgivableKind {
  if (
    typeof value === 'string' &&
    (ADMIN_RATING_FORGIVABLE_KINDS as readonly string[]).includes(value)
  ) {
    return value as AdminRatingForgivableKind;
  }
  throw new BadRequestException(
    `targetKind: ${ADMIN_RATING_FORGIVABLE_KINDS.join(', ')}`,
  );
}

function adjustmentPoints(value: unknown) {
  const points = typeof value === 'string' ? Number(value) : value;
  if (
    typeof points !== 'number' ||
    !Number.isInteger(points) ||
    points < 1 ||
    points > ADMIN_RATING_RULES.adjustmentMaxPoints
  ) {
    throw new BadRequestException(
      `Баллы: целое число от 1 до ${ADMIN_RATING_RULES.adjustmentMaxPoints}`,
    );
  }
  return points;
}

/** A date (YYYY-MM-DD) or a moment; not later than tomorrow. */
function occurredAt(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return new Date();
  }
  // A bare date is taken at midday, so the club's time zone keeps the day.
  const parsed =
    typeof value === 'string'
      ? new Date(
          /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T12:00:00.000Z` : value,
        )
      : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('occurredAt: неверная дата');
  }
  if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw new BadRequestException('occurredAt: дата в будущем');
  }
  return parsed;
}

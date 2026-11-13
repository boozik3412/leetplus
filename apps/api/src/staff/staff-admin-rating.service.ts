import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { clubTimeZoneResolver, clubWallClock } from '../common/club-time';
import { staffLangameIdentityKey } from '../integrations/langame-staff-link';
import { PrismaService } from '../prisma/prisma.service';
import {
  adminRatingShiftKind,
  buildClubAverages,
  computeAdminRating,
  type AdminRatingAdjustment,
  type AdminRatingDisciplineRecord,
  type AdminRatingEscalation,
  type AdminRatingResult,
  type AdminRatingShift,
  type AdminRatingTask,
} from './staff-admin-rating';

export const ADMIN_RATING_ROLES = [
  UserRole.SENIOR_ADMINISTRATOR,
  UserRole.CLUB_ADMINISTRATOR,
] as const;

const ROW_LIMIT = 10000;

export type StaffAdminRatingQuery = {
  start: Date;
  end: Date;
  /** dateFrom / dateTo of the page filter, for drill-down links. */
  dateFrom: string;
  dateTo: string;
  storeId: string | null;
  userId?: string | null;
  search: string | null;
  now?: Date;
};

export type StaffAdminRatingUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  stores: Array<{ id: string; name: string; isActive: boolean }>;
};

export type StaffAdminRatingRow = AdminRatingResult & {
  id: string;
  user: StaffAdminRatingUser;
  shiftsTotal: number;
};

/**
 * One administrator rating for «Операционная дисциплина» and «Рейтинг
 * администраторов». The rules live in staff-admin-rating.ts.
 */
@Injectable()
export class StaffAdminRatingService {
  constructor(private readonly prisma: PrismaService) {}

  async getRatings(
    tenantId: string,
    query: StaffAdminRatingQuery,
  ): Promise<StaffAdminRatingRow[]> {
    const now = query.now ?? new Date();
    const users = await this.prisma.user.findMany({
      where: this.buildUserWhere(tenantId, query),
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        storeAccesses: {
          select: {
            store: { select: { id: true, name: true, isActive: true } },
          },
        },
      },
      orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
    });

    if (users.length === 0) {
      return [];
    }

    const userIds = users.map((user) => user.id);
    const storeWhere = query.storeId ? { storeId: query.storeId } : {};
    const period = { gte: query.start, lte: query.end };

    const [stores, members, shifts, runs, records, tasks, adjustments] =
      await Promise.all([
        this.prisma.store.findMany({
          where: { tenantId },
          select: { id: true, timeZone: true, externalDomain: true },
        }),
        this.prisma.staffMember.findMany({
          where: {
            tenantId,
            userId: { in: userIds },
            externalDomain: { not: null },
            externalUserId: { not: null },
          },
          select: { userId: true, externalDomain: true, externalUserId: true },
        }),
        // Every shift of the clubs: the club average needs the other
        // administrators' shifts too.
        this.prisma.guestWorkingShift.findMany({
          where: {
            tenantId,
            startedAt: period,
            middleCheck: { gt: 0 },
            ...storeWhere,
          },
          select: {
            storeId: true,
            externalDomain: true,
            externalUserId: true,
            startedAt: true,
            middleCheck: true,
          },
          take: ROW_LIMIT,
        }),
        this.prisma.staffChecklistRun.findMany({
          where: {
            tenantId,
            assignedToUserId: { in: userIds },
            ...storeWhere,
            OR: [
              { escalatedAt: period },
              // Escalated by a release that did not record escalatedAt yet.
              { escalatedAt: null, status: 'ESCALATED', updatedAt: period },
            ],
          },
          select: {
            id: true,
            title: true,
            assignedToUserId: true,
            escalatedAt: true,
            updatedAt: true,
            failedItems: true,
            store: { select: { name: true } },
          },
          take: ROW_LIMIT,
        }),
        this.prisma.staffDisciplineRecord.findMany({
          where: {
            tenantId,
            userId: { in: userIds },
            status: 'ACTIVE',
            occurredAt: period,
            ...storeWhere,
          },
          select: {
            id: true,
            userId: true,
            level: true,
            ruleTitleSnapshot: true,
            categorySnapshot: true,
            amount: true,
            occurredAt: true,
          },
          take: ROW_LIMIT,
        }),
        this.prisma.staffTask.findMany({
          where: {
            tenantId,
            assignedToUserId: { in: userIds },
            dueAt: period,
            status: { not: 'CANCELED' },
            ...storeWhere,
          },
          select: {
            id: true,
            title: true,
            status: true,
            dueAt: true,
            completedAt: true,
            assignedToUserId: true,
          },
          take: ROW_LIMIT,
        }),
        // Reviewer decisions: bonuses and penalties dated in the period, and
        // every forgiveness (the forgiven item itself is filtered by period).
        this.prisma.staffAdminRatingAdjustment.findMany({
          where: {
            tenantId,
            userId: { in: userIds },
            status: 'ACTIVE',
            OR: [{ kind: 'FORGIVE' }, { occurredAt: period }],
          },
          select: {
            id: true,
            userId: true,
            kind: true,
            points: true,
            targetKind: true,
            targetId: true,
            reason: true,
            occurredAt: true,
            createdByUser: { select: { fullName: true, email: true } },
          },
          orderBy: { occurredAt: 'desc' },
          take: ROW_LIMIT,
        }),
      ]);

    const zoneOf = clubTimeZoneResolver(stores);
    const formatters = new Map<string, Intl.DateTimeFormat>();
    const tenantZone = zoneOf(null, null);
    const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone: tenantZone,
      day: '2-digit',
      month: '2-digit',
    });
    const formatDate = (value: Date) => dateFormatter.format(value);

    const userByLangameKey = new Map<string, string>();
    members.forEach((member) => {
      if (!member.userId) return;
      userByLangameKey.set(
        staffLangameIdentityKey(
          member.externalDomain ?? '',
          member.externalUserId ?? '',
        ),
        member.userId,
      );
    });
    const linkedUsers = new Set(userByLangameKey.values());

    const allShifts: AdminRatingShift[] = [];
    const shiftsByUser = new Map<string, AdminRatingShift[]>();
    shifts.forEach((shift) => {
      if (!shift.startedAt || shift.middleCheck === null) return;
      const local = clubWallClock(
        shift.startedAt,
        zoneOf(shift.storeId, shift.externalDomain),
        formatters,
      );
      const row: AdminRatingShift = {
        storeId: shift.storeId,
        shiftKind: adminRatingShiftKind(local.getUTCHours()),
        middleCheck: Number(shift.middleCheck),
      };
      allShifts.push(row);
      const userId =
        shift.externalDomain && shift.externalUserId
          ? userByLangameKey.get(
              staffLangameIdentityKey(
                shift.externalDomain,
                shift.externalUserId,
              ),
            )
          : undefined;
      if (userId) {
        push(shiftsByUser, userId, row);
      }
    });
    const clubAverages = buildClubAverages(allShifts);

    const escalationsByUser = new Map<string, AdminRatingEscalation[]>();
    runs.forEach((run) => {
      if (!run.assignedToUserId) return;
      push(escalationsByUser, run.assignedToUserId, {
        id: run.id,
        title: run.title,
        at: run.escalatedAt ?? run.updatedAt,
        storeName: run.store?.name ?? null,
        failedItems: run.failedItems,
      });
    });

    const recordsByUser = new Map<string, AdminRatingDisciplineRecord[]>();
    records.forEach((record) => {
      push(recordsByUser, record.userId, {
        id: record.id,
        level: record.level,
        title: record.ruleTitleSnapshot,
        category: record.categorySnapshot,
        amount: toNumber(record.amount),
        at: record.occurredAt,
      });
    });

    const tasksByUser = new Map<string, AdminRatingTask[]>();
    tasks.forEach((task) => {
      if (!task.assignedToUserId || !task.dueAt) return;
      push(tasksByUser, task.assignedToUserId, {
        id: task.id,
        title: task.title,
        status: task.status,
        dueAt: task.dueAt,
        completedAt: task.completedAt,
      });
    });

    const adjustmentsByUser = new Map<string, AdminRatingAdjustment[]>();
    adjustments.forEach((adjustment) => {
      if (
        adjustment.kind !== 'BONUS' &&
        adjustment.kind !== 'PENALTY' &&
        adjustment.kind !== 'FORGIVE'
      ) {
        return;
      }
      push(adjustmentsByUser, adjustment.userId, {
        id: adjustment.id,
        kind: adjustment.kind,
        points: adjustment.points,
        targetKind: adjustment.targetKind,
        targetId: adjustment.targetId,
        reason: adjustment.reason,
        at: adjustment.occurredAt,
        authorName:
          adjustment.createdByUser?.fullName ??
          adjustment.createdByUser?.email ??
          null,
      });
    });

    const rows = users.map((user): StaffAdminRatingRow => {
      const own = shiftsByUser.get(user.id) ?? [];
      const disciplineParams = new URLSearchParams({
        period: 'range',
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        userId: user.id,
      });
      const result = computeAdminRating({
        now,
        escalations: escalationsByUser.get(user.id) ?? [],
        records: recordsByUser.get(user.id) ?? [],
        tasks: tasksByUser.get(user.id) ?? [],
        shifts: own,
        clubAverages,
        linkedToLangame: linkedUsers.has(user.id),
        disciplineHref: `/staff/discipline?${disciplineParams.toString()}`,
        adjustments: adjustmentsByUser.get(user.id) ?? [],
        formatDate,
      });

      return {
        id: user.id,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          stores: user.storeAccesses.map((access) => access.store),
        },
        shiftsTotal: own.length,
        ...result,
      };
    });

    return rows.sort(
      (a, b) =>
        b.score - a.score ||
        b.rawScore - a.rawScore ||
        (a.user.fullName ?? a.user.email).localeCompare(
          b.user.fullName ?? b.user.email,
          'ru',
        ),
    );
  }

  private buildUserWhere(
    tenantId: string,
    query: StaffAdminRatingQuery,
  ): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      tenantId,
      isActive: true,
      role: { in: [...ADMIN_RATING_ROLES] },
    };

    if (query.userId) {
      where.id = query.userId;
    }

    if (query.storeId) {
      where.storeAccesses = { some: { storeId: query.storeId } };
    }

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

function toNumber(value: Prisma.Decimal | number | null) {
  if (value === null) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}

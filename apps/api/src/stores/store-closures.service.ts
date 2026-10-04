import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, StoreClosure } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  addClosureDays,
  closureDay,
  closuresOverlap,
  parseClosureDay,
  type ClosurePeriod,
} from '../common/store-closure';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type {
  CreateStoreClosureDto,
  UpdateStoreClosureDto,
} from './store-closures.dto';

export type StoreClosureView = {
  id: string;
  storeId: string;
  closedFrom: string;
  reopenedOn: string | null;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A closure can start this far back (a forgotten one) or ahead (a plan). */
const CLOSURE_PAST_DAYS = 400;
const CLOSURE_FUTURE_DAYS = 366;
const CLOSURE_LIST_LIMIT = 500;
const REASON_MAX_LENGTH = 300;

function toView(closure: StoreClosure): StoreClosureView {
  return {
    id: closure.id,
    storeId: closure.storeId,
    closedFrom: closureDay(closure.closedFrom),
    reopenedOn: closure.reopenedOn ? closureDay(closure.reopenedOn) : null,
    reason: closure.reason,
    createdAt: closure.createdAt.toISOString(),
    updatedAt: closure.updatedAt.toISOString(),
  };
}

function dateOfDay(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Today's calendar day in the club's time zone. */
function localToday(timeZone: string | null, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Owner-declared club closures. A closure is a period of club-local days that
 * the dashboards read: a closed club is not a sales decline and its computers
 * are not idle capacity.
 */
@Injectable()
export class StoreClosuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
    private readonly freshStoreScopeService: FreshStoreScopeService,
  ) {}

  /** Recent closures of every club of the network, newest first. */
  async list(user: AuthenticatedUser): Promise<StoreClosureView[]> {
    await this.freshStoreScopeService.assertNetwork(user);
    const { tenantId } = this.tenantContextService.resolve(user);
    const closures = await this.prisma.storeClosure.findMany({
      where: { tenantId },
      orderBy: [{ closedFrom: 'desc' }, { createdAt: 'desc' }],
      take: CLOSURE_LIST_LIMIT,
    });

    return closures.map(toView);
  }

  async create(
    storeId: string,
    dto: CreateStoreClosureDto,
    user: AuthenticatedUser,
  ): Promise<StoreClosureView> {
    await this.freshStoreScopeService.assertNetwork(user);
    const { tenantId } = this.tenantContextService.resolve(user);

    return this.withLockedStore(tenantId, storeId, async (tx, timeZone) => {
      const period = this.resolvePeriod(
        { closedFrom: dto.closedFrom, reopenedOn: dto.reopenedOn ?? null },
        timeZone,
      );
      await this.assertNoOverlap(tx, tenantId, storeId, period, null);
      const closure = await tx.storeClosure.create({
        data: {
          tenantId,
          storeId,
          closedFrom: dateOfDay(period.closedFrom),
          reopenedOn: period.reopenedOn ? dateOfDay(period.reopenedOn) : null,
          reason: this.normalizeReason(dto.reason),
          createdByUserId: user.id,
          updatedByUserId: user.id,
        },
      });

      return toView(closure);
    });
  }

  async update(
    storeId: string,
    closureId: string,
    dto: UpdateStoreClosureDto,
    user: AuthenticatedUser,
  ): Promise<StoreClosureView> {
    await this.freshStoreScopeService.assertNetwork(user);
    const { tenantId } = this.tenantContextService.resolve(user);

    return this.withLockedStore(tenantId, storeId, async (tx, timeZone) => {
      const current = await this.findClosure(tx, tenantId, storeId, closureId);
      const currentView = toView(current);
      const period = this.resolvePeriod(
        {
          closedFrom: dto.closedFrom ?? currentView.closedFrom,
          reopenedOn:
            dto.reopenedOn === undefined
              ? currentView.reopenedOn
              : dto.reopenedOn,
        },
        timeZone,
      );
      await this.assertNoOverlap(tx, tenantId, storeId, period, current.id);
      const closure = await tx.storeClosure.update({
        where: { id: current.id },
        data: {
          closedFrom: dateOfDay(period.closedFrom),
          reopenedOn: period.reopenedOn ? dateOfDay(period.reopenedOn) : null,
          ...(dto.reason === undefined
            ? {}
            : { reason: this.normalizeReason(dto.reason) }),
          updatedByUserId: user.id,
        },
      });

      return toView(closure);
    });
  }

  /** Remove a closure entered by mistake. */
  async remove(
    storeId: string,
    closureId: string,
    user: AuthenticatedUser,
  ): Promise<{ id: string }> {
    await this.freshStoreScopeService.assertNetwork(user);
    const { tenantId } = this.tenantContextService.resolve(user);

    return this.withLockedStore(tenantId, storeId, async (tx) => {
      const current = await this.findClosure(tx, tenantId, storeId, closureId);
      await tx.storeClosure.delete({ where: { id: current.id } });

      return { id: current.id };
    });
  }

  /**
   * Closures of one club are edited one at a time: the store row is locked so
   * that two requests cannot both pass the overlap check.
   */
  private async withLockedStore<T>(
    tenantId: string,
    storeId: string,
    work: (tx: Prisma.TransactionClient, timeZone: string | null) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ timeZone: string | null }>>`
        SELECT "timeZone" FROM public."Store"
        WHERE "id" = ${storeId} AND "tenantId" = ${tenantId}
        FOR UPDATE`;

      if (rows.length === 0) {
        throw new NotFoundException('Клуб не найден');
      }

      return work(tx, rows[0].timeZone);
    });
  }

  private async findClosure(
    tx: Prisma.TransactionClient,
    tenantId: string,
    storeId: string,
    closureId: string,
  ) {
    const closure = await tx.storeClosure.findFirst({
      where: { id: closureId, tenantId, storeId },
    });

    if (!closure) {
      throw new NotFoundException('Закрытие клуба не найдено');
    }

    return closure;
  }

  private resolvePeriod(
    input: { closedFrom: unknown; reopenedOn: unknown },
    timeZone: string | null,
  ): ClosurePeriod {
    const closedFrom = parseClosureDay(input.closedFrom);

    if (!closedFrom) {
      throw new BadRequestException('Укажите дату закрытия в виде ГГГГ-ММ-ДД');
    }

    const reopenedOn =
      input.reopenedOn === null || input.reopenedOn === undefined
        ? null
        : parseClosureDay(input.reopenedOn);

    if (input.reopenedOn !== null && input.reopenedOn !== undefined) {
      if (!reopenedOn) {
        throw new BadRequestException(
          'Укажите дату открытия в виде ГГГГ-ММ-ДД',
        );
      }

      if (reopenedOn <= closedFrom) {
        throw new BadRequestException(
          'Клуб открывается позже даты закрытия: укажите первый рабочий день',
        );
      }
    }

    const today = localToday(timeZone);
    const earliest = addClosureDays(today, -CLOSURE_PAST_DAYS);
    const latest = addClosureDays(today, CLOSURE_FUTURE_DAYS);

    if (closedFrom < earliest || closedFrom > latest) {
      throw new BadRequestException(
        'Дата закрытия слишком далеко от сегодняшнего дня',
      );
    }

    if (reopenedOn && reopenedOn > latest) {
      throw new BadRequestException(
        'Дата открытия слишком далеко от сегодняшнего дня',
      );
    }

    return { closedFrom, reopenedOn };
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    tenantId: string,
    storeId: string,
    period: ClosurePeriod,
    ignoreId: string | null,
  ) {
    const others = await tx.storeClosure.findMany({
      where: {
        tenantId,
        storeId,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { closedFrom: true, reopenedOn: true },
    });
    const clash = others.some((other) =>
      closuresOverlap(period, {
        closedFrom: closureDay(other.closedFrom),
        reopenedOn: other.reopenedOn ? closureDay(other.reopenedOn) : null,
      }),
    );

    if (clash) {
      throw new ConflictException(
        'Эти даты пересекаются с другим закрытием клуба. Откройте клуб или исправьте прежнюю запись.',
      );
    }
  }

  private normalizeReason(value: unknown) {
    if (value === null || value === undefined) return null;

    if (typeof value !== 'string') {
      throw new BadRequestException('Причина должна быть текстом');
    }

    const reason = value.trim();

    if (reason.length > REASON_MAX_LENGTH) {
      throw new BadRequestException(
        `Причина не длиннее ${REASON_MAX_LENGTH} символов`,
      );
    }

    return reason.length > 0 ? reason : null;
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export type SeasonStepCopyDto = {
  expectedTenantId?: string;
  expectedUpdatedAt?: string;
  expectedLevelsMd5?: string;
  expectedStepId?: string;
  expectedCondition?: string;
  expectedDescription?: string;
  condition?: string;
  description?: string;
  requestId?: string;
};

@Injectable()
export class SeasonStepCopyService {
  constructor(private readonly prisma: PrismaService) {}

  async updateCopy(
    user: AuthenticatedUser,
    seasonId: string,
    stepSequence: string,
    dto: SeasonStepCopyDto,
  ) {
    const tenantId = uuid(dto.expectedTenantId, 'expectedTenantId');
    const requestId = uuid(dto.requestId, 'requestId');
    uuid(seasonId, 'seasonId');
    if (tenantId !== user.tenantId)
      throw new ForbiddenException('Сезон не принадлежит выбранной сети.');
    const sequence = Number(stepSequence);
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 100) {
      throw new BadRequestException('Некорректный номер шага.');
    }
    const expectedAt = date(dto.expectedUpdatedAt);
    const levelsMd5 = dto.expectedLevelsMd5?.toLowerCase() ?? '';
    if (!/^[0-9a-f]{32}$/.test(levelsMd5))
      throw new BadRequestException('Укажите MD5 текущих уровней.');
    const stepId = text(dto.expectedStepId, 'expectedStepId', 100);
    const oldCondition = text(dto.expectedCondition, 'expectedCondition', 500);
    const oldDescription = text(
      dto.expectedDescription,
      'expectedDescription',
      1000,
    );
    const condition = text(dto.condition, 'condition', 500);
    const description = text(dto.description, 'description', 1000);
    if (oldCondition === condition && oldDescription === description) {
      throw new BadRequestException('Текст шага не изменился.');
    }
    const commandDigest = createHash('sha256')
      .update(
        JSON.stringify({
          tenantId,
          seasonId,
          sequence,
          expectedAt: expectedAt.toISOString(),
          levelsMd5,
          stepId,
          oldCondition,
          oldDescription,
          condition,
          description,
        }),
      )
      .digest('hex');
    const auditId = deterministicUuid(
      `season-step-copy:${seasonId}:${requestId}`,
    );

    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.guestGameAuditEvent.findUnique({
        where: { id: auditId },
        select: {
          tenantId: true,
          entityId: true,
          action: true,
          status: true,
          payload: true,
        },
      });
      if (prior) {
        const payload = prior.payload as Record<string, unknown> | null;
        const current = await tx.guestGameSeason.findFirst({
          where: { id: seasonId, tenantId },
          select: { levels: true, updatedAt: true },
        });
        const step =
          current && Array.isArray(current.levels)
            ? current.levels.find((value) => object(value).id === stepId)
            : null;
        if (
          prior.tenantId === tenantId &&
          prior.entityId === seasonId &&
          prior.action === 'STEP_COPY_UPDATED_BY_SUPPORT' &&
          prior.status === 'APPLIED' &&
          payload?.actorUserId === user.id &&
          payload?.requestId === requestId &&
          payload?.commandDigest === commandDigest &&
          step &&
          object(step).condition === condition &&
          object(step).description === description
        ) {
          return {
            seasonId,
            sequence,
            updatedAt: current!.updatedAt,
            auditId,
            replayed: true,
          };
        }
        throw new ConflictException(
          'Повтор операции не совпадает с сохранённым результатом.',
        );
      }

      const current = await tx.guestGameSeason.findFirst({
        where: { id: seasonId, tenantId },
        select: { status: true, levels: true, updatedAt: true },
      });
      if (!current) throw new NotFoundException('Сезон не найден.');
      if (
        current.status !== 'ACTIVE' ||
        current.updatedAt.getTime() !== expectedAt.getTime()
      ) {
        throw new ConflictException('Сезон изменился после проверки.');
      }
      if (!Array.isArray(current.levels))
        throw new ConflictException('У сезона нет шагов.');
      const canonical = current.levels
        .map((value, index) => ({
          index,
          level: Number(object(value).level ?? index + 1),
        }))
        .filter((item) => Number.isInteger(item.level) && item.level > 0)
        .sort((a, b) => a.level - b.level);
      const selected = canonical[sequence - 1];
      const step = selected && object(current.levels[selected.index]);
      if (
        !selected ||
        step?.id !== stepId ||
        step?.condition !== oldCondition ||
        step?.description !== oldDescription
      ) {
        throw new ConflictException(
          'Исходный текст или идентификатор шага изменился.',
        );
      }

      // SQL changes exactly two JSONB strings. No full-season normalization or store reconciliation runs.
      const changed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "GuestGameSeason"
        SET "levels" = jsonb_set(
          jsonb_set("levels", ARRAY[${selected.index}::text, 'condition'], to_jsonb(${condition}::text), false),
          ARRAY[${selected.index}::text, 'description'], to_jsonb(${description}::text), false
        ), "updatedAt" = ${new Date()}
        WHERE "id" = ${seasonId} AND "tenantId" = ${tenantId}
          AND "status" = 'ACTIVE' AND "updatedAt" = ${expectedAt}
          AND md5("levels"::text) = ${levelsMd5}
          AND "levels"->${selected.index}->>'id' = ${stepId}
          AND "levels"->${selected.index}->>'condition' = ${oldCondition}
          AND "levels"->${selected.index}->>'description' = ${oldDescription}
        RETURNING "id"
      `);
      if (changed.length !== 1)
        throw new ConflictException(
          'Сезон изменился одновременно с обновлением текста.',
        );
      await tx.guestGameAuditEvent.create({
        data: {
          id: auditId,
          tenantId,
          entityType: 'BATTLE_PASS_SEASON',
          entityId: seasonId,
          action: 'STEP_COPY_UPDATED_BY_SUPPORT',
          status: 'APPLIED',
          payload: {
            actorUserId: user.id,
            requestId,
            commandDigest,
            sequence,
            stepId,
            expectedUpdatedAt: expectedAt.toISOString(),
            expectedLevelsMd5: levelsMd5,
            previousCondition: oldCondition,
            previousDescription: oldDescription,
            condition,
            description,
          },
        },
      });
      const updated = await tx.guestGameSeason.findFirstOrThrow({
        where: { id: seasonId, tenantId },
        select: { updatedAt: true },
      });
      return {
        seasonId,
        sequence,
        updatedAt: updated.updatedAt,
        auditId,
        replayed: false,
      };
    });
  }
}

function uuid(value: string | undefined, label: string) {
  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  ) {
    throw new BadRequestException(`Некорректный ${label}.`);
  }
  return value;
}

function date(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new BadRequestException('Укажите expectedUpdatedAt в UTC.');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new BadRequestException('Некорректный expectedUpdatedAt.');
  }
  return parsed;
}

function text(value: string | undefined, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new BadRequestException(`Некорректный ${label}.`);
  }
  return value;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function deterministicUuid(value: string) {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

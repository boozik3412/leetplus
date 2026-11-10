import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { FreshStoreScopeService } from '../tenancy/fresh-store-scope.service';

/** Saved layout of a club hall, as the corporate editor writes it. */
export type StoreFloorPlanLayout = {
  template: string;
  v: number;
  items: Prisma.JsonArray;
  pcs: Prisma.JsonObject;
};

export type StoreFloorPlanView = {
  storeId: string;
  storeName: string;
  plan: {
    layout: StoreFloorPlanLayout;
    revision: number;
    updatedAt: string;
  } | null;
};

export type SaveStoreFloorPlanDto = {
  layout?: unknown;
  revision?: unknown;
};

const TEMPLATE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const MAX_ITEMS = 400;
const MAX_PCS = 300;
// Below the 100 kB JSON body limit of the API.
const MAX_LAYOUT_BYTES = 90_000;
const MAX_REVISION = 1_000_000_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * The club floor plan («Схема клуба»): one saved layout per club. The hall
 * geometry lives in the web template the layout names; the row keeps the
 * furniture and seat placement the owner set in the editor.
 */
@Injectable()
export class StoreFloorPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freshStoreScopeService: FreshStoreScopeService,
  ) {}

  async get(
    storeId: string,
    user: AuthenticatedUser,
  ): Promise<StoreFloorPlanView> {
    const scope = await this.freshStoreScopeService.resolveRequestedStoreIds(
      user,
      [storeId],
    );
    const store = await this.prisma.store.findFirst({
      where: { tenantId: scope.tenantId, id: storeId },
      select: {
        id: true,
        name: true,
        floorPlan: {
          select: { layout: true, revision: true, updatedAt: true },
        },
      },
    });

    if (!store) {
      throw new NotFoundException('Клуб не найден');
    }

    return {
      storeId: store.id,
      storeName: store.name,
      plan: store.floorPlan
        ? {
            layout: store.floorPlan.layout as unknown as StoreFloorPlanLayout,
            revision: store.floorPlan.revision,
            updatedAt: store.floorPlan.updatedAt.toISOString(),
          }
        : null,
    };
  }

  async save(
    storeId: string,
    dto: SaveStoreFloorPlanDto,
    user: AuthenticatedUser,
  ): Promise<StoreFloorPlanView> {
    const scope = await this.freshStoreScopeService.assertNetwork(user);
    const layout = this.normalizeLayout(dto?.layout);
    const expectedRevision = this.normalizeRevision(dto?.revision);
    const tenantId = scope.tenantId;

    const store = await this.prisma.store.findFirst({
      where: { tenantId, id: storeId },
      select: { id: true },
    });

    if (!store) {
      throw new NotFoundException('Клуб не найден');
    }

    const data = layout as unknown as Prisma.InputJsonObject;

    if (expectedRevision === 0) {
      try {
        await this.prisma.storeFloorPlan.create({
          data: {
            tenantId,
            storeId,
            layout: data,
            revision: 1,
            updatedByUserId: user.id,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw this.staleConflict();
        }
        throw error;
      }
    } else {
      const updated = await this.prisma.storeFloorPlan.updateMany({
        where: { tenantId, storeId, revision: expectedRevision },
        data: {
          layout: data,
          revision: { increment: 1 },
          updatedByUserId: user.id,
        },
      });

      if (updated.count !== 1) {
        throw this.staleConflict();
      }
    }

    return this.get(storeId, user);
  }

  private staleConflict() {
    return new ConflictException(
      'Схему клуба уже сохранили в другом окне. Обновите страницу, чтобы не затереть чужие изменения.',
    );
  }

  private normalizeRevision(value: unknown) {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > MAX_REVISION
    ) {
      throw new BadRequestException('Нужна версия схемы, с которой начали');
    }

    return value;
  }

  normalizeLayout(value: unknown): StoreFloorPlanLayout {
    if (!isPlainObject(value)) {
      throw new BadRequestException('Схема клуба должна быть объектом');
    }

    const { template, v, items, pcs } = value;

    if (typeof template !== 'string' || !TEMPLATE_PATTERN.test(template)) {
      throw new BadRequestException('Неизвестный шаблон зала');
    }

    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 1000) {
      throw new BadRequestException('Неверная версия формата схемы');
    }

    if (
      !Array.isArray(items) ||
      items.length > MAX_ITEMS ||
      !items.every(isPlainObject)
    ) {
      throw new BadRequestException(
        `На схеме может быть не больше ${MAX_ITEMS} предметов`,
      );
    }

    if (
      !isPlainObject(pcs) ||
      Object.keys(pcs).length > MAX_PCS ||
      !Object.values(pcs).every(isPlainObject)
    ) {
      throw new BadRequestException('Неверное расположение игровых мест');
    }

    const layout: StoreFloorPlanLayout = {
      template,
      v,
      items: items as Prisma.JsonArray,
      pcs: pcs as Prisma.JsonObject,
    };

    let serialized: string;
    try {
      serialized = JSON.stringify(layout);
    } catch {
      throw new BadRequestException('Схему клуба не удалось прочитать');
    }

    if (Buffer.byteLength(serialized, 'utf8') > MAX_LAYOUT_BYTES) {
      throw new BadRequestException('Схема клуба слишком большая');
    }

    return JSON.parse(serialized) as StoreFloorPlanLayout;
  }
}

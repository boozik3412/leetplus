import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { normalizeGameLogoUrl } from './game-logo';

export type BrandingSettingsDto = {
  tenantLogoUrl?: unknown;
  storeLogos?: Array<{
    storeId?: unknown;
    logoUrl?: unknown;
  }>;
};

@Injectable()
export class BrandingSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async getSettings(user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const [tenant, stores] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          gameLogoUrl: true,
        },
      }),
      this.prisma.store.findMany({
        where: { tenantId },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          publicSlug: true,
          name: true,
          address: true,
          isActive: true,
          gameLogoUrl: true,
        },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException('Организация не найдена');
    }

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        gameLogoUrl: tenant.gameLogoUrl,
      },
      stores,
    };
  }

  async saveSettings(user: AuthenticatedUser, dto: BrandingSettingsDto) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const payload = dto && typeof dto === 'object' ? dto : {};
    const tenantLogoUrl = this.normalizeLogoUrl(
      payload.tenantLogoUrl,
      'Логотип сети',
    );
    const storeLogoEntries = this.normalizeStoreLogoEntries(payload.storeLogos);

    await this.prisma.$transaction(async (tx) => {
      if (tenantLogoUrl !== undefined) {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { gameLogoUrl: tenantLogoUrl },
        });
      }

      if (storeLogoEntries.length === 0) {
        return;
      }

      const storeIds = storeLogoEntries.map((entry) => entry.storeId);
      const existingStores = await tx.store.findMany({
        where: {
          tenantId,
          id: { in: storeIds },
        },
        select: { id: true },
      });
      const existingIds = new Set(existingStores.map((store) => store.id));
      const missingStoreId = storeIds.find(
        (storeId) => !existingIds.has(storeId),
      );

      if (missingStoreId) {
        throw new BadRequestException('Клуб для логотипа не найден');
      }

      await Promise.all(
        storeLogoEntries.map((entry) =>
          tx.store.update({
            where: { id: entry.storeId },
            data: { gameLogoUrl: entry.logoUrl },
          }),
        ),
      );
    });

    return this.getSettings(user);
  }

  private normalizeStoreLogoEntries(value: unknown) {
    if (value === undefined) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('Передайте список логотипов клубов');
    }

    const entries = new Map<string, string | null>();

    for (const [index, item] of value.entries()) {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('Некорректная строка логотипа клуба');
      }

      const storeIdValue = (item as { storeId?: unknown }).storeId;

      if (typeof storeIdValue !== 'string' || !storeIdValue.trim()) {
        throw new BadRequestException('Укажите клуб для логотипа');
      }

      entries.set(
        storeIdValue.trim(),
        this.normalizeLogoUrl(
          (item as { logoUrl?: unknown }).logoUrl,
          `Логотип клуба #${index + 1}`,
        ) ?? null,
      );
    }

    return [...entries.entries()].map(([storeId, logoUrl]) => ({
      storeId,
      logoUrl,
    }));
  }

  private normalizeLogoUrl(value: unknown, label: string) {
    return normalizeGameLogoUrl(value, label);
  }
}

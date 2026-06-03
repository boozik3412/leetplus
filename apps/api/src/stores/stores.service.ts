import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CreateStoreDto, UpdateStoreDto } from './stores.dto';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async findAll(user?: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    return this.prisma.store.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateStoreDto, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const name = this.normalizeName(dto.name);
    const publicSlug =
      dto.publicSlug == null
        ? await this.generateUniquePublicSlug(tenantId, name)
        : await this.normalizePublicSlug(dto.publicSlug, tenantId);

    return this.prisma.store.create({
      data: {
        tenantId,
        name,
        publicSlug,
        address: this.normalizeOptionalString(dto.address),
      },
    });
  }

  async update(id: string, dto: UpdateStoreDto, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.findOneForTenant(id, tenantId);

    return this.prisma.store.update({
      where: { id: current.id },
      data: {
        ...(dto.name !== undefined
          ? { name: this.normalizeName(dto.name) }
          : {}),
        ...(dto.publicSlug !== undefined
          ? {
              publicSlug: await this.normalizePublicSlug(
                dto.publicSlug,
                tenantId,
                current.id,
              ),
            }
          : {}),
        ...(dto.address !== undefined
          ? { address: this.normalizeOptionalString(dto.address) }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async archive(id: string, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.findOneForTenant(id, tenantId);

    return this.prisma.store.update({
      where: { id: current.id },
      data: { isActive: false },
    });
  }

  private async findOneForTenant(id: string, tenantId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id, tenantId },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return store;
  }

  private normalizeName(name: string): string {
    const normalized = name?.trim();

    if (!normalized) {
      throw new BadRequestException('Store name is required');
    }

    return normalized;
  }

  private normalizeOptionalString(value: string | null | undefined) {
    if (value === null || value === undefined) {
      return value;
    }

    return value.trim() || null;
  }

  private async normalizePublicSlug(
    value: string | null | undefined,
    tenantId: string,
    currentStoreId?: string,
  ) {
    const slug = slugify(value ?? '');

    if (!slug) {
      return null;
    }

    const existing = await this.prisma.store.findFirst({
      where: {
        tenantId,
        publicSlug: slug,
        ...(currentStoreId ? { id: { not: currentStoreId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Публичный slug клуба уже используется.');
    }

    return slug;
  }

  private async generateUniquePublicSlug(tenantId: string, name: string) {
    const base = slugify(name) || 'club';

    for (let index = 0; index < 50; index += 1) {
      const candidate = index === 0 ? base : `${base}-${index + 1}`;
      const existing = await this.prisma.store.findFirst({
        where: { tenantId, publicSlug: candidate },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }
    }

    return `club-${Date.now().toString(36)}`;
  }
}

function slugify(value: string) {
  const transliterated = value
    .toLowerCase()
    .split('')
    .map((char) => cyrillicSlugMap[char] ?? char)
    .join('');

  return transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64);
}

const cyrillicSlugMap: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

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

    return this.prisma.store.create({
      data: {
        tenantId,
        name: this.normalizeName(dto.name),
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
}

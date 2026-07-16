import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async findAll(user?: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    return this.prisma.category.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    });
  }

  async create(dto: CreateCategoryDto, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const name = this.normalizeName(dto.name);

    try {
      return await this.prisma.category.create({
        data: {
          tenantId,
          name,
        },
      });
    } catch (error) {
      this.handleUniqueConstraint(error, name);
      throw error;
    }
  }

  async update(id: string, dto: UpdateCategoryDto, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.findOneForTenant(id, tenantId);
    const name = dto.name ? this.normalizeName(dto.name) : current.name;

    try {
      return await this.prisma.category.update({
        where: { id: current.id },
        data: { name },
      });
    } catch (error) {
      this.handleUniqueConstraint(error, name);
      throw error;
    }
  }

  async remove(id: string, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.findOneForTenant(id, tenantId);
    const [productsCount, mappingsCount] = await Promise.all([
      this.prisma.product.count({
        where: {
          tenantId,
          categoryId: current.id,
        },
      }),
      this.prisma.categorySourceMapping.count({
        where: {
          tenantId,
          categoryId: current.id,
        },
      }),
    ]);

    if (productsCount > 0) {
      throw new BadRequestException(
        'Category with linked products cannot be deleted',
      );
    }

    if (mappingsCount > 0) {
      throw new BadRequestException(
        'Category with Langame mappings cannot be deleted',
      );
    }

    await this.prisma.category.delete({
      where: { id: current.id },
    });

    return { ok: true };
  }

  private async findOneForTenant(id: string, tenantId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  private normalizeName(name: string): string {
    const normalized = name?.trim();

    if (!normalized) {
      throw new BadRequestException('Category name is required');
    }

    return normalized;
  }

  private handleUniqueConstraint(error: unknown, name: string): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(`Category "${name}" already exists`);
    }
  }
}

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
import type {
  CreateCategoryDto,
  MergeCategoriesDto,
  UpdateCategoryDto,
} from './categories.dto';

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

  async merge(dto: MergeCategoriesDto, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const categoryIds = this.normalizeMergeCategoryIds(dto.categoryIds);
    const targetCategoryId = this.requiredId(
      dto.targetCategoryId,
      'Target category',
    );

    if (!categoryIds.includes(targetCategoryId)) {
      throw new BadRequestException(
        'The target category must be one of the selected categories',
      );
    }

    const categories = await this.prisma.category.findMany({
      where: { tenantId, id: { in: categoryIds } },
      select: { id: true, name: true },
    });

    if (categories.length !== categoryIds.length) {
      throw new NotFoundException('One or more categories are unavailable');
    }

    const target = categories.find((category) => category.id === targetCategoryId);

    if (!target) {
      throw new NotFoundException('Target category not found');
    }

    const sourceCategoryIds = categoryIds.filter((id) => id !== targetCategoryId);

    return this.prisma.$transaction(async (tx) => {
      const mappings = await tx.categorySourceMapping.findMany({
        where: {
          tenantId,
          categoryId: { in: sourceCategoryIds },
        },
        select: {
          id: true,
          categoryId: true,
          source: true,
          externalDomain: true,
          externalGroupId: true,
        },
      });
      const productsUpdated = await tx.product.updateMany({
        where: {
          tenantId,
          categoryId: { in: sourceCategoryIds },
        },
        data: { categoryId: targetCategoryId },
      });

      for (const mapping of mappings) {
        await tx.categorySourceMapping.update({
          where: { id: mapping.id },
          data: { categoryId: targetCategoryId },
        });
        await tx.categorySourceMappingEvent.create({
          data: {
            tenantId,
            mappingId: mapping.id,
            action: 'CATEGORY_MERGED',
            source: mapping.source,
            externalDomain: mapping.externalDomain,
            externalGroupId: mapping.externalGroupId,
            previousValue: { categoryId: mapping.categoryId },
            nextValue: { categoryId: targetCategoryId },
            createdByUserId: user.id,
          },
        });
      }

      await tx.category.deleteMany({
        where: {
          tenantId,
          id: { in: sourceCategoryIds },
        },
      });

      return {
        targetCategory: target,
        mergedCategories: sourceCategoryIds.length,
        productsUpdated: productsUpdated.count,
        mappingsUpdated: mappings.length,
      };
    });
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

  private normalizeMergeCategoryIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('Categories to merge are required');
    }

    const categoryIds = [...new Set(value.map((id) => this.requiredId(id, 'Category')))];

    if (categoryIds.length < 2) {
      throw new BadRequestException('Select at least two categories to merge');
    }

    return categoryIds;
  }

  private requiredId(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required`);
    }

    return value.trim();
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

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuthenticatedUser } from '../auth/auth.types';
import type { CreateProductDto, UpdateProductDto } from './products.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async findAll(user?: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    return this.prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      include: {
        category: true,
        supplier: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findById(id: string, user?: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    return this.prisma.product.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        category: true,
        supplier: true,
      },
    });
  }

  async create(dto: CreateProductDto, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const data = await this.normalizeCreateData(dto, tenantId);

    try {
      return await this.prisma.product.create({
        data,
        include: {
          category: true,
          supplier: true,
        },
      });
    } catch (error) {
      this.handleUniqueConstraint(error, dto.article);
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.findOneForTenant(id, tenantId);
    const data = await this.normalizeUpdateData(dto, tenantId);

    try {
      return await this.prisma.product.update({
        where: { id: current.id },
        data,
        include: {
          category: true,
          supplier: true,
        },
      });
    } catch (error) {
      this.handleUniqueConstraint(error, dto.article ?? current.article);
      throw error;
    }
  }

  async archive(id: string, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.findOneForTenant(id, tenantId);

    return this.prisma.product.update({
      where: { id: current.id },
      data: { isActive: false },
      include: {
        category: true,
        supplier: true,
      },
    });
  }

  private async findOneForTenant(id: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async normalizeCreateData(
    dto: CreateProductDto,
    tenantId: string,
  ): Promise<Prisma.ProductUncheckedCreateInput> {
    const categoryId = await this.resolveOptionalCategory(
      dto.categoryId,
      tenantId,
    );
    const supplierId = await this.resolveOptionalSupplier(
      dto.supplierId,
      tenantId,
    );
    const facing = this.normalizeOptionalInteger(dto.facing ?? 1, 'Facing');
    const shelfLifeDays = this.normalizeOptionalInteger(
      dto.shelfLifeDays,
      'Shelf life days',
    );

    return {
      tenantId,
      article: this.normalizeRequiredString(dto.article, 'Article'),
      name: this.normalizeRequiredString(dto.name, 'Product name'),
      purchasePrice: new Prisma.Decimal(dto.purchasePrice),
      salePrice: new Prisma.Decimal(dto.salePrice),
      facing: facing ?? 1,
      ...(shelfLifeDays !== undefined ? { shelfLifeDays } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(supplierId !== undefined ? { supplierId } : {}),
    };
  }

  private async normalizeUpdateData(
    dto: UpdateProductDto,
    tenantId: string,
  ): Promise<Prisma.ProductUncheckedUpdateInput> {
    const categoryId = await this.resolveOptionalCategory(
      dto.categoryId,
      tenantId,
    );
    const supplierId = await this.resolveOptionalSupplier(
      dto.supplierId,
      tenantId,
    );
    const facing = this.normalizeOptionalInteger(dto.facing, 'Facing');
    const shelfLifeDays = this.normalizeOptionalInteger(
      dto.shelfLifeDays,
      'Shelf life days',
    );

    return {
      ...(dto.article !== undefined
        ? { article: this.normalizeRequiredString(dto.article, 'Article') }
        : {}),
      ...(dto.name !== undefined
        ? { name: this.normalizeRequiredString(dto.name, 'Product name') }
        : {}),
      ...(dto.purchasePrice !== undefined
        ? { purchasePrice: new Prisma.Decimal(dto.purchasePrice) }
        : {}),
      ...(dto.salePrice !== undefined
        ? { salePrice: new Prisma.Decimal(dto.salePrice) }
        : {}),
      ...(facing !== undefined && facing !== null ? { facing } : {}),
      ...(shelfLifeDays !== undefined ? { shelfLifeDays } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(supplierId !== undefined ? { supplierId } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };
  }

  private normalizeRequiredString(value: string, fieldName: string) {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return normalized;
  }

  private normalizeOptionalInteger(
    value: number | null | undefined,
    fieldName: string,
  ) {
    if (value === null || value === undefined) {
      return value;
    }

    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }

    return value;
  }

  private async resolveOptionalCategory(
    categoryId: string | null | undefined,
    tenantId: string,
  ) {
    if (categoryId === undefined || categoryId === null || categoryId === '') {
      return categoryId === '' ? null : categoryId;
    }

    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, tenantId },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException('Category does not belong to tenant');
    }

    return category.id;
  }

  private async resolveOptionalSupplier(
    supplierId: string | null | undefined,
    tenantId: string,
  ) {
    if (supplierId === undefined || supplierId === null || supplierId === '') {
      return supplierId === '' ? null : supplierId;
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { id: true },
    });

    if (!supplier) {
      throw new BadRequestException('Supplier does not belong to tenant');
    }

    return supplier.id;
  }

  private handleUniqueConstraint(error: unknown, article: string): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `Product article "${article}" already exists`,
      );
    }
  }
}

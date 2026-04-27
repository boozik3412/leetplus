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
import type { CreateSupplierDto, UpdateSupplierDto } from './suppliers.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async findAll(user?: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    return this.prisma.supplier.findMany({
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

  async create(dto: CreateSupplierDto, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const data = this.normalizeData(dto);
    const name = this.normalizeName(dto.name);

    try {
      return await this.prisma.supplier.create({
        data: {
          tenantId,
          name,
          ...data,
        },
      });
    } catch (error) {
      this.handleUniqueConstraint(error, name);
      throw error;
    }
  }

  async update(id: string, dto: UpdateSupplierDto, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.findOneForTenant(id, tenantId);
    const data = this.normalizeData(dto);

    try {
      return await this.prisma.supplier.update({
        where: { id: current.id },
        data,
      });
    } catch (error) {
      this.handleUniqueConstraint(error, data.name ?? current.name);
      throw error;
    }
  }

  async archive(id: string, user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const current = await this.findOneForTenant(id, tenantId);

    return this.prisma.supplier.update({
      where: { id: current.id },
      data: { isActive: false },
    });
  }

  private async findOneForTenant(id: string, tenantId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  private normalizeData(dto: UpdateSupplierDto) {
    const name = dto.name ? this.normalizeName(dto.name) : undefined;

    const paymentDelayDays = this.normalizeOptionalInteger(
      dto.paymentDelayDays,
      'Payment delay days',
    );
    const orderMultiplicity = this.normalizeOptionalInteger(
      dto.orderMultiplicity,
      'Order multiplicity',
    );
    const minOrderAmount =
      dto.minOrderAmount === null || dto.minOrderAmount === undefined
        ? dto.minOrderAmount
        : new Prisma.Decimal(dto.minOrderAmount);

    return {
      ...(name ? { name } : {}),
      ...(paymentDelayDays !== undefined ? { paymentDelayDays } : {}),
      ...(orderMultiplicity !== undefined ? { orderMultiplicity } : {}),
      ...(minOrderAmount !== undefined ? { minOrderAmount } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };
  }

  private normalizeName(name: string): string {
    const normalized = name?.trim();

    if (!normalized) {
      throw new BadRequestException('Supplier name is required');
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

  private handleUniqueConstraint(error: unknown, name: string): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(`Supplier "${name}" already exists`);
    }
  }
}

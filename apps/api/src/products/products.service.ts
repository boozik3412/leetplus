import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductAssortmentRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuthenticatedUser } from '../auth/auth.types';
import type {
  CreateProductDto,
  ProductCatalogQuery,
  UpdateProductDto,
} from './products.dto';
import { buildProductCostBasis } from '../reports/stock-cost-basis';

const OPERATIONAL_ACTIVE_DAYS = 14;
const CATALOG_PAGE_SIZE = 50;
const MAX_CATALOG_PAGE_SIZE = 100;

const PRODUCT_CATALOG_SORT_FIELDS = [
  'name',
  'article',
  'category',
  'supplier',
  'assortmentRole',
  'isMandatory',
  'purchasePrice',
  'salePrice',
  'createdAt',
] as const;

type ProductCatalogSort = (typeof PRODUCT_CATALOG_SORT_FIELDS)[number];
type ProductCatalogDirection = 'asc' | 'desc';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async findAll(user?: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const operationalActivePeriod = this.resolveOperationalActivePeriod();

    const latestSalesPeriod = this.resolveLatestSalesPeriod();
    const [products, productStores, recentSalesFacts, latestSalesFacts] =
      await Promise.all([
        this.prisma.product.findMany({
          where: {
            tenantId,
            isActive: true,
          },
          include: {
            category: true,
            supplier: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
        this.prisma.inventorySnapshot.findMany({
          where: {
            tenantId,
            snapshotDate: {
              lte: operationalActivePeriod.toDate,
            },
          },
          select: {
            productId: true,
            storeId: true,
            snapshotDate: true,
            quantity: true,
            store: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            snapshotDate: 'desc',
          },
        }),
        this.prisma.salesFact.findMany({
          where: {
            tenantId,
            isCanceled: false,
            saleDate: {
              gte: operationalActivePeriod.fromDate,
              lte: operationalActivePeriod.toDate,
            },
          },
          select: {
            productId: true,
          },
          distinct: ['productId'],
        }),
        this.prisma.salesFact.findMany({
          where: {
            tenantId,
            isCanceled: false,
            saleDate: {
              gte: latestSalesPeriod.fromDate,
              lte: latestSalesPeriod.toDate,
            },
          },
          select: {
            productId: true,
            quantity: true,
            revenue: true,
            cost: true,
          },
          orderBy: {
            saleDate: 'desc',
          },
          distinct: ['productId'],
        }),
      ]);
    const storesByProduct = new Map<
      string,
      { storeIds: string[]; storeNames: string[] }
    >();
    const stockByProduct = new Map<string, number>();
    const seenSnapshots = new Set<string>();
    const recentlySoldProductIds = new Set(
      recentSalesFacts.map((fact) => fact.productId),
    );
    const costBasisByProduct = buildProductCostBasis(products, productStores);
    const latestSaleByProduct = new Map(
      latestSalesFacts.map((fact) => {
        const quantity = fact.quantity.toNumber();
        const unitSalePrice =
          quantity > 0 ? fact.revenue.toNumber() / quantity : 0;
        const unitCost = quantity > 0 ? fact.cost.toNumber() / quantity : null;

        return [fact.productId, { unitSalePrice, unitCost }] as const;
      }),
    );

    productStores.forEach((snapshot) => {
      const snapshotKey = `${snapshot.storeId}:${snapshot.productId}`;

      if (seenSnapshots.has(snapshotKey)) {
        return;
      }

      seenSnapshots.add(snapshotKey);
      const current = storesByProduct.get(snapshot.productId) ?? {
        storeIds: [],
        storeNames: [],
      };

      if (!current.storeIds.includes(snapshot.storeId)) {
        current.storeIds.push(snapshot.storeId);
      }

      if (!current.storeNames.includes(snapshot.store.name)) {
        current.storeNames.push(snapshot.store.name);
      }

      storesByProduct.set(snapshot.productId, current);
      stockByProduct.set(
        snapshot.productId,
        (stockByProduct.get(snapshot.productId) ?? 0) +
          snapshot.quantity.toNumber(),
      );
    });

    return products.map((product) => {
      const storeInfo = storesByProduct.get(product.id) ?? {
        storeIds: [],
        storeNames: [],
      };
      const latestSale = latestSaleByProduct.get(product.id);
      const purchasePrice =
        product.purchasePrice.toNumber() > 0
          ? product.purchasePrice
          : new Prisma.Decimal(latestSale?.unitCost ?? 0);
      const salePrice =
        product.salePrice.toNumber() > 0
          ? product.salePrice
          : new Prisma.Decimal(latestSale?.unitSalePrice ?? 0);

      return {
        ...product,
        purchasePrice,
        salePrice,
        unitCost:
          costBasisByProduct.get(product.id)?.unitCost ??
          latestSale?.unitCost ??
          null,
        isOperationalActive:
          (stockByProduct.get(product.id) ?? 0) > 0 ||
          recentlySoldProductIds.has(product.id),
        storeIds: storeInfo.storeIds,
        storeNames: storeInfo.storeNames.sort((a, b) => a.localeCompare(b)),
      };
    });
  }

  async getSummary(user?: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const operationalActivePeriod = this.resolveOperationalActivePeriod();

    const [
      totalSku,
      categorizedSku,
      suppliedSku,
      latestInventory,
      recentSalesFacts,
    ] = await Promise.all([
      this.prisma.product.count({
        where: { tenantId, isActive: true },
      }),
      this.prisma.product.count({
        where: { tenantId, isActive: true, categoryId: { not: null } },
      }),
      this.prisma.product.count({
        where: { tenantId, isActive: true, supplierId: { not: null } },
      }),
      this.prisma.inventorySnapshot.findMany({
        where: {
          tenantId,
          snapshotDate: { lte: operationalActivePeriod.toDate },
          product: { isActive: true },
        },
        select: {
          productId: true,
          quantity: true,
        },
        distinct: ['storeId', 'productId'],
        orderBy: [
          { storeId: 'asc' },
          { productId: 'asc' },
          { snapshotDate: 'desc' },
        ],
      }),
      this.prisma.salesFact.findMany({
        where: {
          tenantId,
          isCanceled: false,
          saleDate: {
            gte: operationalActivePeriod.fromDate,
            lte: operationalActivePeriod.toDate,
          },
          product: { isActive: true },
        },
        select: { productId: true },
        distinct: ['productId'],
      }),
    ]);

    const operationalActiveProductIds = new Set(
      latestInventory
        .filter((snapshot) => snapshot.quantity.toNumber() > 0)
        .map((snapshot) => snapshot.productId),
    );

    recentSalesFacts.forEach((fact) => {
      operationalActiveProductIds.add(fact.productId);
    });

    return {
      totalSku,
      operationalActiveSku: operationalActiveProductIds.size,
      categorizedSku,
      suppliedSku,
    };
  }

  async getCatalog(query: ProductCatalogQuery, user?: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const request = this.resolveCatalogQuery(query);
    const operationalActivePeriod = this.resolveOperationalActivePeriod();
    const latestSalesPeriod = this.resolveLatestSalesPeriod();
    const where: Prisma.ProductWhereInput = {
      tenantId,
      isActive: true,
      ...(request.name
        ? { name: { contains: request.name, mode: 'insensitive' } }
        : {}),
      ...(request.storeIds.length > 0
        ? {
            inventorySnapshots: {
              some: {
                storeId: { in: request.storeIds },
                snapshotDate: { lte: operationalActivePeriod.toDate },
              },
            },
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          supplier: true,
        },
        orderBy: this.catalogOrderBy(request.sort, request.direction),
        skip: (request.page - 1) * request.pageSize,
        take: request.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    if (products.length === 0) {
      return {
        items: [],
        page: request.page,
        pageSize: request.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / request.pageSize)),
      };
    }

    const productIds = products.map((product) => product.id);
    const [latestInventory, recentSalesFacts, latestSalesFacts] =
      await Promise.all([
        this.prisma.inventorySnapshot.findMany({
          where: {
            tenantId,
            productId: { in: productIds },
            snapshotDate: { lte: operationalActivePeriod.toDate },
          },
          select: {
            productId: true,
            storeId: true,
            quantity: true,
            store: { select: { name: true } },
          },
          distinct: ['storeId', 'productId'],
          orderBy: [
            { storeId: 'asc' },
            { productId: 'asc' },
            { snapshotDate: 'desc' },
          ],
        }),
        this.prisma.salesFact.findMany({
          where: {
            tenantId,
            productId: { in: productIds },
            isCanceled: false,
            saleDate: {
              gte: operationalActivePeriod.fromDate,
              lte: operationalActivePeriod.toDate,
            },
          },
          select: { productId: true },
          distinct: ['productId'],
        }),
        this.prisma.salesFact.findMany({
          where: {
            tenantId,
            productId: { in: productIds },
            isCanceled: false,
            saleDate: {
              gte: latestSalesPeriod.fromDate,
              lte: latestSalesPeriod.toDate,
            },
          },
          select: {
            productId: true,
            quantity: true,
            revenue: true,
            cost: true,
          },
          distinct: ['productId'],
          orderBy: [{ productId: 'asc' }, { saleDate: 'desc' }],
        }),
      ]);

    const stockByProduct = new Map<string, number>();
    const storesByProduct = new Map<
      string,
      { storeIds: string[]; storeNames: string[] }
    >();

    latestInventory.forEach((snapshot) => {
      const current = storesByProduct.get(snapshot.productId) ?? {
        storeIds: [],
        storeNames: [],
      };

      current.storeIds.push(snapshot.storeId);
      current.storeNames.push(snapshot.store.name);
      storesByProduct.set(snapshot.productId, current);
      stockByProduct.set(
        snapshot.productId,
        (stockByProduct.get(snapshot.productId) ?? 0) +
          snapshot.quantity.toNumber(),
      );
    });

    const recentlySoldProductIds = new Set(
      recentSalesFacts.map((fact) => fact.productId),
    );
    const latestSaleByProduct = new Map(
      latestSalesFacts.map((fact) => {
        const quantity = fact.quantity.toNumber();

        return [
          fact.productId,
          {
            unitCost: quantity > 0 ? fact.cost.toNumber() / quantity : null,
            unitSalePrice:
              quantity > 0 ? fact.revenue.toNumber() / quantity : null,
          },
        ] as const;
      }),
    );

    return {
      items: products.map((product) => {
        const latestSale = latestSaleByProduct.get(product.id);
        const storeInfo = storesByProduct.get(product.id) ?? {
          storeIds: [],
          storeNames: [],
        };
        const purchasePrice =
          product.purchasePrice.toNumber() > 0
            ? product.purchasePrice
            : new Prisma.Decimal(latestSale?.unitCost ?? 0);
        const salePrice =
          product.salePrice.toNumber() > 0
            ? product.salePrice
            : new Prisma.Decimal(latestSale?.unitSalePrice ?? 0);

        return {
          ...product,
          purchasePrice,
          salePrice,
          unitCost:
            product.purchasePrice.toNumber() > 0
              ? product.purchasePrice.toNumber()
              : (latestSale?.unitCost ?? null),
          isOperationalActive:
            (stockByProduct.get(product.id) ?? 0) > 0 ||
            recentlySoldProductIds.has(product.id),
          storeIds: storeInfo.storeIds,
          storeNames: storeInfo.storeNames.sort((a, b) => a.localeCompare(b)),
        };
      }),
      page: request.page,
      pageSize: request.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / request.pageSize)),
    };
  }

  private resolveOperationalActivePeriod() {
    const now = new Date();
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const fromDate = new Date(toDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - (OPERATIONAL_ACTIVE_DAYS - 1));
    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

    return { fromDate, toDate };
  }

  private resolveLatestSalesPeriod() {
    const now = new Date();
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const fromDate = new Date(toDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - 364);
    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

    return { fromDate, toDate };
  }

  private resolveCatalogQuery(query: ProductCatalogQuery) {
    const page = this.resolveBoundedInteger(
      query.page,
      1,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const pageSize = this.resolveBoundedInteger(
      query.pageSize,
      CATALOG_PAGE_SIZE,
      1,
      MAX_CATALOG_PAGE_SIZE,
    );
    const sort = PRODUCT_CATALOG_SORT_FIELDS.includes(
      query.sort as ProductCatalogSort,
    )
      ? (query.sort as ProductCatalogSort)
      : 'name';
    const storeValues = Array.isArray(query.storeId)
      ? query.storeId
      : query.storeId
        ? [query.storeId]
        : [];
    const storeIds = [
      ...new Set(
        storeValues
          .flatMap((value) => value.split(','))
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];

    return {
      page,
      pageSize,
      name: query.name?.trim() ?? '',
      storeIds,
      sort,
      direction: query.direction === 'desc' ? 'desc' : 'asc',
    } satisfies {
      page: number;
      pageSize: number;
      name: string;
      storeIds: string[];
      sort: ProductCatalogSort;
      direction: ProductCatalogDirection;
    };
  }

  private resolveBoundedInteger(
    value: string | number | undefined,
    fallback: number,
    min: number,
    max: number,
  ) {
    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(parsed, min), max);
  }

  private catalogOrderBy(
    sort: ProductCatalogSort,
    direction: ProductCatalogDirection,
  ): Prisma.ProductOrderByWithRelationInput[] {
    const tieBreaker: Prisma.ProductOrderByWithRelationInput = { id: 'asc' };

    if (sort === 'category') {
      return [{ category: { name: direction } }, { name: 'asc' }, tieBreaker];
    }

    if (sort === 'supplier') {
      return [{ supplier: { name: direction } }, { name: 'asc' }, tieBreaker];
    }

    return [{ [sort]: direction }, { name: 'asc' }, tieBreaker];
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
      assortmentRole:
        this.normalizeAssortmentRole(dto.assortmentRole) ??
        ProductAssortmentRole.OPTIONAL,
      isMandatory: Boolean(dto.isMandatory),
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
      ...(dto.assortmentRole !== undefined
        ? {
            assortmentRole: this.normalizeAssortmentRole(dto.assortmentRole),
          }
        : {}),
      ...(dto.isMandatory !== undefined
        ? { isMandatory: Boolean(dto.isMandatory) }
        : {}),
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

  private normalizeAssortmentRole(value?: ProductAssortmentRole | null) {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (!Object.values(ProductAssortmentRole).includes(value)) {
      throw new BadRequestException('Invalid assortment role');
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

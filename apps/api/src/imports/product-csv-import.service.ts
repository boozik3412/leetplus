import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type CsvRecord = Record<string, string | undefined>;

type RelationLookup = {
  categories: Map<string, string>;
  suppliers: Map<string, string>;
};

export type ProductImportError = {
  row: number;
  field: string;
  message: string;
};

export type ProductImportRow = {
  row: number;
  article: string;
  name: string;
  purchasePrice: string;
  salePrice: string;
  facing: number;
  shelfLifeDays: number | null;
  categoryName: string | null;
  supplierName: string | null;
  categoryId: string | null;
  supplierId: string | null;
};

export type ProductImportPreview = {
  totalRows: number;
  validRows: number;
  errors: ProductImportError[];
  rows: ProductImportRow[];
};

const PRODUCT_IMPORT_TYPE = 'PRODUCT_CSV' as const;
const IMPORT_STATUS_COMPLETED = 'COMPLETED' as const;
const IMPORT_STATUS_FAILED = 'FAILED' as const;

@Injectable()
export class ProductCsvImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async preview(
    csv: string,
    user: AuthenticatedUser,
  ): Promise<ProductImportPreview> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const records = this.parseCsv(csv);
    const lookup = await this.loadRelationLookup(tenantId);
    const seenArticles = new Set<string>();
    const errors: ProductImportError[] = [];
    const rows: ProductImportRow[] = [];

    records.forEach((record, index) => {
      const rowNumber = index + 2;
      const normalized = this.normalizeRecord(
        record,
        rowNumber,
        lookup,
        errors,
      );

      if (!normalized) {
        return;
      }

      const articleKey = normalized.article.toLowerCase();

      if (seenArticles.has(articleKey)) {
        errors.push({
          row: rowNumber,
          field: 'article',
          message: 'Артикул дублируется внутри CSV',
        });
        return;
      }

      seenArticles.add(articleKey);
      rows.push(normalized);
    });

    return {
      totalRows: records.length,
      validRows: rows.length,
      errors,
      rows,
    };
  }

  async findRecent(user: AuthenticatedUser) {
    const { tenantId } = await this.tenantContextService.resolve(user);

    return this.prisma.importJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: {
          select: {
            email: true,
            fullName: true,
          },
        },
      },
    });
  }

  async import(csv: string, user: AuthenticatedUser, sourceFileName?: string) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const preview = await this.preview(csv, user);

    if (preview.errors.length > 0) {
      await this.createImportJob({
        tenantId,
        userId: user.id,
        sourceFileName,
        status: IMPORT_STATUS_FAILED,
        totalRows: preview.totalRows,
        validRows: preview.validRows,
        importedRows: 0,
        errors: preview.errors,
      });

      throw new BadRequestException({
        message: 'CSV contains validation errors',
        preview,
      });
    }

    const imported = await this.prisma.$transaction(
      preview.rows.map((row) =>
        this.prisma.product.upsert({
          where: {
            tenantId_article: {
              tenantId,
              article: row.article,
            },
          },
          create: {
            tenantId,
            article: row.article,
            name: row.name,
            purchasePrice: new Prisma.Decimal(row.purchasePrice),
            salePrice: new Prisma.Decimal(row.salePrice),
            facing: row.facing,
            shelfLifeDays: row.shelfLifeDays,
            categoryId: row.categoryId,
            supplierId: row.supplierId,
          },
          update: {
            name: row.name,
            purchasePrice: new Prisma.Decimal(row.purchasePrice),
            salePrice: new Prisma.Decimal(row.salePrice),
            facing: row.facing,
            shelfLifeDays: row.shelfLifeDays,
            categoryId: row.categoryId,
            supplierId: row.supplierId,
            isActive: true,
          },
        }),
      ),
    );

    const importJob = await this.createImportJob({
      tenantId,
      userId: user.id,
      sourceFileName,
      status: IMPORT_STATUS_COMPLETED,
      totalRows: preview.totalRows,
      validRows: preview.validRows,
      importedRows: imported.length,
      errors: [],
    });

    return {
      importedRows: imported.length,
      importJob,
      preview,
    };
  }

  private createImportJob({
    tenantId,
    userId,
    sourceFileName,
    status,
    totalRows,
    validRows,
    importedRows,
    errors,
  }: {
    tenantId: string;
    userId: string;
    sourceFileName?: string;
    status: typeof IMPORT_STATUS_COMPLETED | typeof IMPORT_STATUS_FAILED;
    totalRows: number;
    validRows: number;
    importedRows: number;
    errors: ProductImportError[];
  }) {
    return this.prisma.importJob.create({
      data: {
        tenantId,
        userId,
        type: PRODUCT_IMPORT_TYPE,
        sourceFileName: sourceFileName?.trim() || null,
        status,
        totalRows,
        validRows,
        importedRows,
        errorsCount: errors.length,
        errorSummary: errors.slice(0, 20),
      },
    });
  }

  private parseCsv(csv: string): CsvRecord[] {
    if (!csv?.trim()) {
      throw new BadRequestException('CSV content is required');
    }

    try {
      return parse(csv, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      throw new BadRequestException('CSV file cannot be parsed');
    }
  }

  private async loadRelationLookup(tenantId: string): Promise<RelationLookup> {
    const [categories, suppliers] = await Promise.all([
      this.prisma.category.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
      this.prisma.supplier.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
    ]);

    return {
      categories: new Map(
        categories.map((category) => [this.key(category.name), category.id]),
      ),
      suppliers: new Map(
        suppliers.map((supplier) => [this.key(supplier.name), supplier.id]),
      ),
    };
  }

  private normalizeRecord(
    record: CsvRecord,
    rowNumber: number,
    lookup: RelationLookup,
    errors: ProductImportError[],
  ): ProductImportRow | null {
    const article = this.readField(record, ['article', 'артикул']);
    const name = this.readField(record, ['name', 'наименование', 'товар']);
    const purchasePrice = this.readNumberField(record, [
      'purchasePrice',
      'purchase_price',
      'входящая цена',
      'закупочная цена',
    ]);
    const salePrice = this.readNumberField(record, [
      'salePrice',
      'sale_price',
      'цена продажи',
      'розничная цена',
    ]);
    const facing = this.readIntegerField(record, ['facing', 'фейсинг'], 1);
    const shelfLifeDays = this.readNullableIntegerField(record, [
      'shelfLifeDays',
      'shelf_life_days',
      'срок годности',
      'срок годности дней',
    ]);
    const categoryName =
      this.readField(record, ['category', 'категория']) || null;
    const supplierName =
      this.readField(record, ['supplier', 'поставщик']) || null;
    const categoryId = categoryName
      ? (lookup.categories.get(this.key(categoryName)) ?? null)
      : null;
    const supplierId = supplierName
      ? (lookup.suppliers.get(this.key(supplierName)) ?? null)
      : null;

    this.requireValue(
      article,
      rowNumber,
      'article',
      'Артикул обязателен',
      errors,
    );
    this.requireValue(
      name,
      rowNumber,
      'name',
      'Наименование обязательно',
      errors,
    );
    this.requireValue(
      purchasePrice,
      rowNumber,
      'purchasePrice',
      'Входящая цена обязательна',
      errors,
    );
    this.requireValue(
      salePrice,
      rowNumber,
      'salePrice',
      'Цена продажи обязательна',
      errors,
    );

    if (purchasePrice !== '' && !this.isValidNumber(purchasePrice)) {
      errors.push({
        row: rowNumber,
        field: 'purchasePrice',
        message: 'Входящая цена должна быть числом',
      });
    }

    if (
      purchasePrice !== '' &&
      this.isValidNumber(purchasePrice) &&
      Number(purchasePrice) < 0
    ) {
      errors.push({
        row: rowNumber,
        field: 'purchasePrice',
        message: 'Входящая цена не может быть отрицательной',
      });
    }

    if (salePrice !== '' && !this.isValidNumber(salePrice)) {
      errors.push({
        row: rowNumber,
        field: 'salePrice',
        message: 'Цена продажи должна быть числом',
      });
    }

    if (
      salePrice !== '' &&
      this.isValidNumber(salePrice) &&
      Number(salePrice) < 0
    ) {
      errors.push({
        row: rowNumber,
        field: 'salePrice',
        message: 'Цена продажи не может быть отрицательной',
      });
    }

    if (!Number.isInteger(facing) || facing < 0) {
      errors.push({
        row: rowNumber,
        field: 'facing',
        message: 'Фейсинг должен быть целым неотрицательным числом',
      });
    }

    if (
      shelfLifeDays !== null &&
      (!Number.isInteger(shelfLifeDays) || shelfLifeDays < 0)
    ) {
      errors.push({
        row: rowNumber,
        field: 'shelfLifeDays',
        message: 'Срок годности должен быть целым неотрицательным числом',
      });
    }

    if (categoryName && !categoryId) {
      errors.push({
        row: rowNumber,
        field: 'category',
        message: `Категория "${categoryName}" не найдена`,
      });
    }

    if (supplierName && !supplierId) {
      errors.push({
        row: rowNumber,
        field: 'supplier',
        message: `Поставщик "${supplierName}" не найден`,
      });
    }

    if (!article || !name || !purchasePrice || !salePrice) {
      return null;
    }

    return {
      row: rowNumber,
      article,
      name,
      purchasePrice,
      salePrice,
      facing,
      shelfLifeDays,
      categoryName,
      supplierName,
      categoryId,
      supplierId,
    };
  }

  private readField(record: CsvRecord, aliases: string[]) {
    const normalizedAliases = aliases.map((alias) => this.key(alias));
    const entry = Object.entries(record).find(([header]) =>
      normalizedAliases.includes(this.key(header)),
    );

    return entry?.[1]?.trim() ?? '';
  }

  private readNumberField(record: CsvRecord, aliases: string[]) {
    return this.readField(record, aliases).replace(',', '.');
  }

  private readIntegerField(
    record: CsvRecord,
    aliases: string[],
    fallback: number,
  ) {
    const value = this.readField(record, aliases);
    return value ? Number(value) : fallback;
  }

  private readNullableIntegerField(record: CsvRecord, aliases: string[]) {
    const value = this.readField(record, aliases);
    return value ? Number(value) : null;
  }

  private requireValue(
    value: string,
    row: number,
    field: string,
    message: string,
    errors: ProductImportError[],
  ) {
    if (!value) {
      errors.push({ row, field, message });
    }
  }

  private isValidNumber(value: string) {
    return Number.isFinite(Number(value));
  }

  private key(value: string) {
    return value.trim().toLowerCase().replace(/ё/g, 'е');
  }
}

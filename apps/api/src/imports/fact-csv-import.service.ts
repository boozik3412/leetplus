import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type CsvRecord = Record<string, string | undefined>;

type ImportError = {
  row: number;
  field: string;
  message: string;
};

type StoreLookup = Map<string, { id: string; name: string }>;
type ProductLookup = Map<
  string,
  { id: string; article: string; name: string; purchasePrice: Prisma.Decimal }
>;

type FactLookup = {
  stores: StoreLookup;
  products: ProductLookup;
};

export type InventoryImportRow = {
  row: number;
  date: string;
  storeName: string;
  article: string;
  productName: string;
  quantity: string;
  storeId: string;
  productId: string;
};

export type SalesImportRow = InventoryImportRow & {
  revenue: string;
  cost: string;
};

export type FactImportPreview<T> = {
  totalRows: number;
  validRows: number;
  errors: ImportError[];
  rows: T[];
};

const INVENTORY_IMPORT_TYPE = 'INVENTORY_CSV' as const;
const SALES_IMPORT_TYPE = 'SALES_CSV' as const;
const IMPORT_STATUS_COMPLETED = 'COMPLETED' as const;
const IMPORT_STATUS_FAILED = 'FAILED' as const;

@Injectable()
export class FactCsvImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async previewInventory(
    csv: string,
    user: AuthenticatedUser,
  ): Promise<FactImportPreview<InventoryImportRow>> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const records = this.parseCsv(csv);
    const lookup = await this.loadLookup(tenantId);
    const errors: ImportError[] = [];
    const rows: InventoryImportRow[] = [];
    const seen = new Set<string>();

    records.forEach((record, index) => {
      const rowNumber = index + 2;
      const normalized = this.normalizeInventoryRecord(
        record,
        rowNumber,
        lookup,
        errors,
      );

      if (!normalized) {
        return;
      }

      const key = this.factKey(
        normalized.date,
        normalized.storeId,
        normalized.productId,
      );

      if (seen.has(key)) {
        errors.push({
          row: rowNumber,
          field: 'article',
          message: 'Остаток для этой даты, точки и SKU дублируется внутри CSV',
        });
        return;
      }

      seen.add(key);
      rows.push(normalized);
    });

    return this.preview(records.length, rows, errors);
  }

  async previewSales(
    csv: string,
    user: AuthenticatedUser,
  ): Promise<FactImportPreview<SalesImportRow>> {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const records = this.parseCsv(csv);
    const lookup = await this.loadLookup(tenantId);
    const errors: ImportError[] = [];
    const rows: SalesImportRow[] = [];
    const seen = new Set<string>();

    records.forEach((record, index) => {
      const rowNumber = index + 2;
      const normalized = this.normalizeSalesRecord(
        record,
        rowNumber,
        lookup,
        errors,
      );

      if (!normalized) {
        return;
      }

      const key = this.factKey(
        normalized.date,
        normalized.storeId,
        normalized.productId,
      );

      if (seen.has(key)) {
        errors.push({
          row: rowNumber,
          field: 'article',
          message: 'Продажи для этой даты, точки и SKU дублируются внутри CSV',
        });
        return;
      }

      seen.add(key);
      rows.push(normalized);
    });

    return this.preview(records.length, rows, errors);
  }

  async importInventory(
    csv: string,
    user: AuthenticatedUser,
    sourceFileName?: string,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const preview = await this.previewInventory(csv, user);

    if (preview.errors.length > 0) {
      await this.createImportJob({
        tenantId,
        userId: user.id,
        sourceFileName,
        type: INVENTORY_IMPORT_TYPE,
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
        this.prisma.inventorySnapshot.upsert({
          where: {
            tenantId_storeId_productId_snapshotDate: {
              tenantId,
              storeId: row.storeId,
              productId: row.productId,
              snapshotDate: new Date(row.date),
            },
          },
          create: {
            tenantId,
            storeId: row.storeId,
            productId: row.productId,
            snapshotDate: new Date(row.date),
            quantity: new Prisma.Decimal(row.quantity),
          },
          update: {
            quantity: new Prisma.Decimal(row.quantity),
          },
        }),
      ),
    );

    const importJob = await this.createImportJob({
      tenantId,
      userId: user.id,
      sourceFileName,
      type: INVENTORY_IMPORT_TYPE,
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

  async importSales(
    csv: string,
    user: AuthenticatedUser,
    sourceFileName?: string,
  ) {
    const { tenantId } = await this.tenantContextService.resolve(user);
    const preview = await this.previewSales(csv, user);

    if (preview.errors.length > 0) {
      await this.createImportJob({
        tenantId,
        userId: user.id,
        sourceFileName,
        type: SALES_IMPORT_TYPE,
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
        this.prisma.salesFact.upsert({
          where: {
            tenantId_storeId_productId_saleDate: {
              tenantId,
              storeId: row.storeId,
              productId: row.productId,
              saleDate: new Date(row.date),
            },
          },
          create: {
            tenantId,
            storeId: row.storeId,
            productId: row.productId,
            saleDate: new Date(row.date),
            quantity: new Prisma.Decimal(row.quantity),
            revenue: new Prisma.Decimal(row.revenue),
            cost: new Prisma.Decimal(row.cost),
          },
          update: {
            quantity: new Prisma.Decimal(row.quantity),
            revenue: new Prisma.Decimal(row.revenue),
            cost: new Prisma.Decimal(row.cost),
          },
        }),
      ),
    );

    const importJob = await this.createImportJob({
      tenantId,
      userId: user.id,
      sourceFileName,
      type: SALES_IMPORT_TYPE,
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

  private preview<T>(
    totalRows: number,
    rows: T[],
    errors: ImportError[],
  ): FactImportPreview<T> {
    return {
      totalRows,
      validRows: rows.length,
      errors,
      rows,
    };
  }

  private async loadLookup(tenantId: string): Promise<FactLookup> {
    const [stores, products] = await Promise.all([
      this.prisma.store.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          article: true,
          name: true,
          purchasePrice: true,
        },
      }),
    ]);

    return {
      stores: new Map(stores.map((store) => [this.key(store.name), store])),
      products: new Map(
        products.map((product) => [this.key(product.article), product]),
      ),
    };
  }

  private normalizeInventoryRecord(
    record: CsvRecord,
    rowNumber: number,
    lookup: FactLookup,
    errors: ImportError[],
    quantityConfig = {
      aliases: ['quantity', 'stock', 'остаток', 'количество'],
      requiredMessage: 'Остаток обязателен',
    },
  ): InventoryImportRow | null {
    const date = this.readDate(record, rowNumber, errors);
    const storeName = this.readField(record, [
      'store',
      'storeName',
      'торговая точка',
      'точка',
      'клуб',
    ]);
    const article = this.readField(record, ['article', 'sku', 'артикул']);
    const quantity = this.readNumberField(record, quantityConfig.aliases);
    const store = storeName ? lookup.stores.get(this.key(storeName)) : null;
    const product = article ? lookup.products.get(this.key(article)) : null;

    this.requireValue(date, rowNumber, 'date', 'Дата обязательна', errors);
    this.requireValue(
      storeName,
      rowNumber,
      'store',
      'Торговая точка обязательна',
      errors,
    );
    this.requireValue(
      article,
      rowNumber,
      'article',
      'Артикул обязателен',
      errors,
    );
    this.requireValue(
      quantity,
      rowNumber,
      'quantity',
      quantityConfig.requiredMessage,
      errors,
    );

    if (storeName && !store) {
      errors.push({
        row: rowNumber,
        field: 'store',
        message: `Торговая точка "${storeName}" не найдена`,
      });
    }

    if (article && !product) {
      errors.push({
        row: rowNumber,
        field: 'article',
        message: `Товар с артикулом "${article}" не найден`,
      });
    }

    this.validateNonNegativeNumber(quantity, rowNumber, 'quantity', errors);

    if (!date || !store || !product || !quantity) {
      return null;
    }

    return {
      row: rowNumber,
      date,
      storeName: store.name,
      article: product.article,
      productName: product.name,
      quantity,
      storeId: store.id,
      productId: product.id,
    };
  }

  private normalizeSalesRecord(
    record: CsvRecord,
    rowNumber: number,
    lookup: FactLookup,
    errors: ImportError[],
  ): SalesImportRow | null {
    const base = this.normalizeInventoryRecord(
      record,
      rowNumber,
      lookup,
      errors,
      {
        aliases: ['quantity', 'soldQuantity', 'количество', 'продано'],
        requiredMessage: 'Количество продаж обязательно',
      },
    );
    const revenue = this.readNumberField(record, [
      'revenue',
      'salesAmount',
      'выручка',
      'сумма продаж',
      'сумма',
    ]);
    const costFromCsv = this.readNumberField(record, [
      'cost',
      'costAmount',
      'себестоимость',
    ]);

    this.requireValue(
      revenue,
      rowNumber,
      'revenue',
      'Выручка обязательна',
      errors,
    );
    this.validateNonNegativeNumber(revenue, rowNumber, 'revenue', errors);

    if (costFromCsv) {
      this.validateNonNegativeNumber(costFromCsv, rowNumber, 'cost', errors);
    }

    if (!base || !revenue) {
      return null;
    }

    const product = lookup.products.get(this.key(base.article));
    const cost =
      costFromCsv ||
      product?.purchasePrice
        .mul(new Prisma.Decimal(base.quantity))
        .toString() ||
      '0';

    return {
      ...base,
      revenue,
      cost,
    };
  }

  private createImportJob({
    tenantId,
    userId,
    sourceFileName,
    type,
    status,
    totalRows,
    validRows,
    importedRows,
    errors,
  }: {
    tenantId: string;
    userId: string;
    sourceFileName?: string;
    type: typeof INVENTORY_IMPORT_TYPE | typeof SALES_IMPORT_TYPE;
    status: typeof IMPORT_STATUS_COMPLETED | typeof IMPORT_STATUS_FAILED;
    totalRows: number;
    validRows: number;
    importedRows: number;
    errors: ImportError[];
  }) {
    return this.prisma.importJob.create({
      data: {
        tenantId,
        userId,
        type,
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

  private readDate(
    record: CsvRecord,
    rowNumber: number,
    errors: ImportError[],
  ) {
    const value = this.readField(record, [
      'date',
      'saleDate',
      'snapshotDate',
      'дата',
    ]);

    if (!value) {
      return '';
    }

    const parsed = this.parseDate(value);

    if (!parsed) {
      errors.push({
        row: rowNumber,
        field: 'date',
        message: 'Дата должна быть в формате YYYY-MM-DD или DD.MM.YYYY',
      });
      return '';
    }

    return parsed;
  }

  private parseDate(value: string) {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const ruMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);

    if (isoMatch) {
      return this.toIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);
    }

    if (ruMatch) {
      return this.toIsoDate(ruMatch[3], ruMatch[2], ruMatch[1]);
    }

    return null;
  }

  private toIsoDate(year: string, month: string, day: string) {
    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );

    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) {
      return null;
    }

    return date.toISOString();
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

  private requireValue(
    value: string,
    row: number,
    field: string,
    message: string,
    errors: ImportError[],
  ) {
    if (!value) {
      errors.push({ row, field, message });
    }
  }

  private validateNonNegativeNumber(
    value: string,
    row: number,
    field: string,
    errors: ImportError[],
  ) {
    if (!value) {
      return;
    }

    if (!Number.isFinite(Number(value))) {
      errors.push({
        row,
        field,
        message: 'Значение должно быть числом',
      });
      return;
    }

    if (Number(value) < 0) {
      errors.push({
        row,
        field,
        message: 'Значение не может быть отрицательным',
      });
    }
  }

  private factKey(date: string, storeId: string, productId: string) {
    return `${date}:${storeId}:${productId}`;
  }

  private key(value: string) {
    return value.trim().toLowerCase().replace(/ё/g, 'е');
  }
}

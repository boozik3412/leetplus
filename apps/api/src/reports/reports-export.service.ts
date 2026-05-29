import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ReportsService,
  type AssortmentReport,
  type LflGroupLevel,
  type LflPeriod,
  type LflReport,
  type OperationalReport,
  type OperationalReportQuery,
  type ReportRecommendation,
  type ReplenishmentReport,
  type ReplenishmentRow,
  type ReplenishmentRisk,
  type SalesDetailReport,
  type SkuPerformanceReport,
  type SuppliersPerformanceReport,
} from './reports.service';

export type ReportExportFormat = 'csv' | 'xlsx';

export type ReportExportQuery = OperationalReportQuery & {
  format?: string;
  report?: string;
  lflPeriod?: LflPeriod;
  category?: string;
  replenishmentRisk?: string | string[];
  replenishmentStoreName?: string | string[];
  replenishmentCategoryName?: string | string[];
  replenishmentSupplierName?: string | string[];
  replenishmentProductName?: string | string[];
  replenishmentSort?: string;
  replenishmentSortDirection?: string;
};

export type ReportExportFile = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  tenantSlug: string;
  from: string;
  to: string;
};

type CsvCell = string | number | boolean | null;
type SalesDetailColumn = {
  header: string;
  key: keyof SalesDetailReport['rows'][number];
  width: number;
};

type ProductMovementRow = {
  productName: string;
  storeName: string;
  categoryName: string;
  totalQuantity: number;
  stockQuantity: number;
  revenue: number;
  dailyQuantity: Record<string, number>;
};

type ReplenishmentExportSortKey =
  | 'risk'
  | 'article'
  | 'name'
  | 'storeName'
  | 'categoryName'
  | 'supplierName'
  | 'stockQuantity'
  | 'soldQuantity'
  | 'averageDailySales'
  | 'stockDays'
  | 'dailyNeed'
  | 'recommendedOrder';

const REPLENISHMENT_EXPORT_SORT_KEYS: readonly ReplenishmentExportSortKey[] = [
  'risk',
  'article',
  'name',
  'storeName',
  'categoryName',
  'supplierName',
  'stockQuantity',
  'soldQuantity',
  'averageDailySales',
  'stockDays',
  'dailyNeed',
  'recommendedOrder',
];

@Injectable()
export class ReportsExportService {
  constructor(private readonly reportsService: ReportsService) {}

  async exportReports(
    user: AuthenticatedUser,
    query: ReportExportQuery,
  ): Promise<ReportExportFile> {
    const format = this.resolveFormat(query.format);

    if (query.report === 'lfl') {
      return this.exportLflReport(user, query, format);
    }

    if (query.report === 'sales-detail') {
      return this.exportSalesDetailReport(user, query, format);
    }

    if (query.report === 'replenishment') {
      return this.exportReplenishmentReport(user, query, format);
    }

    if (query.report === 'product-movement') {
      return this.exportProductMovementReport(user, query, format);
    }

    const [
      assortmentReport,
      operationalReport,
      salesDetailReport,
      skuPerformanceReport,
      replenishmentReport,
      suppliersPerformanceReport,
    ] = await Promise.all([
      this.reportsService.getAssortmentReport(user),
      this.reportsService.getOperationalReport(user, query),
      this.reportsService.getSalesDetailReport(user, query),
      this.reportsService.getSkuPerformanceReport(user, query),
      this.reportsService.getReplenishmentReport(user, query),
      this.reportsService.getSuppliersPerformanceReport(user, query),
    ]);
    const fileName = `leetplus-reports-${operationalReport.from}-${operationalReport.to}.${format}`;

    if (format === 'csv') {
      return {
        buffer: Buffer.from(
          this.buildCsv(
            assortmentReport,
            operationalReport,
            salesDetailReport,
            skuPerformanceReport,
            replenishmentReport,
            suppliersPerformanceReport,
          ),
          'utf8',
        ),
        contentType: 'text/csv; charset=utf-8',
        fileName,
        tenantSlug: operationalReport.tenantSlug,
        from: operationalReport.from,
        to: operationalReport.to,
      };
    }

    return {
      buffer: await this.buildXlsx(
        assortmentReport,
        operationalReport,
        salesDetailReport,
        skuPerformanceReport,
        replenishmentReport,
        suppliersPerformanceReport,
      ),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName,
      tenantSlug: operationalReport.tenantSlug,
      from: operationalReport.from,
      to: operationalReport.to,
    };
  }

  private async exportLflReport(
    user: AuthenticatedUser,
    query: ReportExportQuery,
    format: ReportExportFormat,
  ): Promise<ReportExportFile> {
    const period = this.resolveLflPeriod(query.lflPeriod);
    const report = await this.reportsService.getLflReport(user, { period });
    const fileName = `leetplus-lfl-${report.period}-${report.currentFrom}-${report.currentTo}.${format}`;

    if (format === 'csv') {
      return {
        buffer: Buffer.from(this.buildLflCsv(report), 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        fileName,
        tenantSlug: report.tenantSlug,
        from: report.currentFrom,
        to: report.currentTo,
      };
    }

    return {
      buffer: await this.buildLflXlsx(report),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName,
      tenantSlug: report.tenantSlug,
      from: report.currentFrom,
      to: report.currentTo,
    };
  }

  private async exportSalesDetailReport(
    user: AuthenticatedUser,
    query: ReportExportQuery,
    format: ReportExportFormat,
  ): Promise<ReportExportFile> {
    const report = await this.reportsService.getSalesDetailReport(user, query);
    const fileName = `leetplus-sales-detail-${report.from}-${report.to}.${format}`;

    if (format === 'csv') {
      return {
        buffer: Buffer.from(this.buildSalesDetailCsv(report), 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        fileName,
        tenantSlug: report.tenantSlug,
        from: report.from,
        to: report.to,
      };
    }

    return {
      buffer: await this.buildSalesDetailXlsx(report),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName,
      tenantSlug: report.tenantSlug,
      from: report.from,
      to: report.to,
    };
  }

  private async exportReplenishmentReport(
    user: AuthenticatedUser,
    query: ReportExportQuery,
    format: ReportExportFormat,
  ): Promise<ReportExportFile> {
    const report = await this.reportsService.getReplenishmentReport(
      user,
      query,
    );
    const exportReport = this.applyReplenishmentTableState(report, query);
    const fileName = `leetplus-replenishment-${report.from}-${report.to}.${format}`;

    if (format === 'csv') {
      return {
        buffer: Buffer.from(this.buildReplenishmentCsv(exportReport), 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        fileName,
        tenantSlug: report.tenantSlug,
        from: report.from,
        to: report.to,
      };
    }

    return {
      buffer: await this.buildReplenishmentXlsx(exportReport),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName,
      tenantSlug: report.tenantSlug,
      from: report.from,
      to: report.to,
    };
  }

  private applyReplenishmentTableState(
    report: ReplenishmentReport,
    query: ReportExportQuery,
  ): ReplenishmentReport {
    const rows = report.rows.filter((row) =>
      this.matchesReplenishmentTableFilters(row, query),
    );
    const sortKey = this.resolveReplenishmentSortKey(query.replenishmentSort);

    if (!sortKey) {
      return { ...report, rows };
    }

    const sortDirection =
      query.replenishmentSortDirection === 'desc' ? 'desc' : 'asc';
    const sortedRows = [...rows].sort((a, b) => {
      const result = this.compareExportValues(
        this.replenishmentSortValue(a, sortKey),
        this.replenishmentSortValue(b, sortKey),
      );

      return sortDirection === 'asc' ? result : -result;
    });

    return { ...report, rows: sortedRows };
  }

  private matchesReplenishmentTableFilters(
    row: ReplenishmentRow,
    query: ReportExportQuery,
  ) {
    return (
      this.matchesExactQueryValues(
        this.replenishmentRiskLabel(row.risk),
        query.replenishmentRisk,
      ) &&
      this.matchesExactQueryValues(
        row.storeName,
        query.replenishmentStoreName,
      ) &&
      this.matchesExactQueryValues(
        row.categoryName,
        query.replenishmentCategoryName,
      ) &&
      this.matchesExactQueryValues(
        row.supplierName,
        query.replenishmentSupplierName,
      ) &&
      this.matchesTextQuery(row.name, query.replenishmentProductName)
    );
  }

  private resolveReplenishmentSortKey(
    value?: string,
  ): ReplenishmentExportSortKey | null {
    if (
      value &&
      (REPLENISHMENT_EXPORT_SORT_KEYS as readonly string[]).includes(value)
    ) {
      return value as ReplenishmentExportSortKey;
    }

    return null;
  }

  private replenishmentSortValue(
    row: ReplenishmentRow,
    key: ReplenishmentExportSortKey,
  ) {
    if (key === 'risk') {
      return this.replenishmentRiskLabel(row.risk);
    }

    return row[key];
  }

  private matchesExactQueryValues(
    value: string | null,
    queryValue?: string | string[],
  ) {
    const allowedValues = this.queryValues(queryValue);

    if (allowedValues.length === 0) {
      return true;
    }

    return allowedValues.includes(value ?? '');
  }

  private matchesTextQuery(value: string, queryValue?: string | string[]) {
    const search = this.queryValues(queryValue)[0]?.toLocaleLowerCase('ru');

    if (!search) {
      return true;
    }

    return value.toLocaleLowerCase('ru').includes(search);
  }

  private queryValues(value?: string | string[]) {
    const values = Array.isArray(value) ? value : [value];

    return values
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  private compareExportValues(
    a: string | number | null,
    b: string | number | null,
  ) {
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }

    return String(a ?? '').localeCompare(String(b ?? ''), 'ru');
  }

  private async exportProductMovementReport(
    user: AuthenticatedUser,
    query: ReportExportQuery,
    format: ReportExportFormat,
  ): Promise<ReportExportFile> {
    const [salesReport, replenishmentReport] = await Promise.all([
      this.reportsService.getSalesDetailReport(user, query),
      this.reportsService.getReplenishmentReport(user, query),
    ]);
    const fileName = `leetplus-product-movement-${salesReport.from}-${salesReport.to}.${format}`;
    const rows = this.buildProductMovementRows(
      salesReport,
      replenishmentReport,
      query.category,
    );

    if (format === 'csv') {
      return {
        buffer: Buffer.from(
          this.buildProductMovementCsv(salesReport, rows, query.category),
          'utf8',
        ),
        contentType: 'text/csv; charset=utf-8',
        fileName,
        tenantSlug: salesReport.tenantSlug,
        from: salesReport.from,
        to: salesReport.to,
      };
    }

    return {
      buffer: await this.buildProductMovementXlsx(
        salesReport,
        rows,
        query.category,
      ),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName,
      tenantSlug: salesReport.tenantSlug,
      from: salesReport.from,
      to: salesReport.to,
    };
  }

  private resolveFormat(format?: string): ReportExportFormat {
    if (!format || format === 'csv') {
      return 'csv';
    }

    if (format === 'xlsx') {
      return 'xlsx';
    }

    throw new BadRequestException('format must be csv or xlsx');
  }

  private resolveLflPeriod(period?: string): LflPeriod {
    if (!period || period === 'day') {
      return 'day';
    }

    if (period === 'week' || period === 'month') {
      return period;
    }

    throw new BadRequestException('lflPeriod must be day, week or month');
  }

  private buildCsv(
    assortmentReport: AssortmentReport,
    operationalReport: OperationalReport,
    salesDetailReport: SalesDetailReport,
    skuPerformanceReport: SkuPerformanceReport,
    replenishmentReport: ReplenishmentReport,
    suppliersPerformanceReport: SuppliersPerformanceReport,
  ) {
    const rows: CsvCell[][] = [
      ['Отчеты LeetPlus'],
      ['Организация', operationalReport.tenantSlug],
      ['Период', `${operationalReport.from} - ${operationalReport.to}`],
      ['Торговая точка', operationalReport.storeId ?? 'Все точки'],
      [],
      ['Операционная сводка'],
      ['Показатель', 'Значение'],
      ['Выручка', operationalReport.totalRevenue],
      ['Себестоимость', operationalReport.totalCost],
      ['Валовая прибыль', operationalReport.grossProfit],
      ['Прибыль с учетом потерь', operationalReport.adjustedGrossProfit],
      ['Маржинальность, %', operationalReport.marginPercent],
      [
        'Маржинальность с учетом потерь, %',
        operationalReport.adjustedMarginPercent,
      ],
      ['Продано, шт', operationalReport.soldQuantity],
      ['Списания, шт', operationalReport.writeOffQuantity],
      ['Списания, сумма', operationalReport.writeOffAmount],
      ['Возвраты, шт', operationalReport.returnQuantity],
      ['Возвраты, сумма', operationalReport.returnAmount],
      ['Среднедневная выручка', operationalReport.averageDailyRevenue],
      ['Остатки, шт', operationalReport.stockQuantity],
      ['Остаток в днях', operationalReport.stockDays],
      [],
      ['Общий отчет по продажам'],
      this.salesDetailHeaders().map((header) => header.header),
      ...salesDetailReport.rows.map((item) =>
        this.salesDetailHeaders().map((header) => item[header.key]),
      ),
      [],
      ['Рекомендации'],
      [
        'Приоритет',
        'Статус',
        'Ответственный',
        'Тип',
        'Артикул',
        'Товар',
        'Эффект, руб',
        'Тип эффекта',
        'Показатель',
        'Значение',
        'Действие',
        'Описание',
      ],
      ...operationalReport.recommendations.map((item) => [
        this.recommendationSeverityLabel(item.severity),
        this.recommendationStatusLabel(item.status),
        this.recommendationRoleLabel(item.role),
        this.recommendationKindLabel(item.kind),
        item.article,
        item.productName,
        item.effectAmount,
        item.effectLabel,
        item.metricLabel,
        item.metricValue,
        item.action,
        item.description,
      ]),
      [],
      ['Риск out-of-stock'],
      [
        'Клуб',
        'Артикул',
        'Товар',
        'Поставщик',
        'Остаток, шт',
        'Средние продажи в день',
        'Выручка в риске / день',
        'Прибыль в риске / день',
        'Прибыль в риске за период',
        'Остаток в днях',
      ],
      ...operationalReport.outOfStockRiskProducts.map((item) => [
        item.storeName,
        item.article,
        item.name,
        item.supplierName,
        item.stockQuantity,
        item.averageDailySales,
        item.revenueAtRiskPerDay,
        item.grossProfitAtRiskPerDay,
        item.grossProfitAtRiskForPeriod,
        item.stockDays,
      ]),
      [],
      ['Товары без продаж'],
      [
        'Артикул',
        'Товар',
        'Категория',
        'Поставщик',
        'Остаток, шт',
        'Оценка, руб/шт',
        'Источник оценки',
        'Заморожено денег',
      ],
      ...operationalReport.productsWithoutSales.map((item) => [
        item.article,
        item.name,
        item.categoryName,
        item.supplierName,
        item.stockQuantity,
        item.frozenStockUnitValue,
        this.frozenStockValuationLabel(item.frozenStockValuation),
        item.frozenStockAmount,
      ]),
      [],
      ['Остатки и потребность'],
      [
        'Риск',
        'Артикул',
        'Товар',
        'Категория',
        'Поставщик',
        'Остаток, шт',
        'Продано, шт',
        'Средние продажи в день',
        'Остаток в днях',
        'Потребность в день',
        'Рекомендованный заказ',
        'Кратность заказа',
      ],
      ...replenishmentReport.rows.map((item) => [
        this.replenishmentRiskLabel(item.risk),
        item.article,
        item.name,
        item.categoryName,
        item.supplierName,
        item.stockQuantity,
        item.soldQuantity,
        item.averageDailySales,
        item.stockDays,
        item.dailyNeed,
        item.recommendedOrder,
        item.orderMultiplicity,
      ]),
      [],
      ['ABC по выручке'],
      [
        'Группа',
        'SKU',
        'Доля ассортимента, %',
        'Доля выручки, %',
        'Доля прибыли, %',
      ],
      ...skuPerformanceReport.abcByRevenue.map((item) => [
        item.group,
        item.productsCount,
        item.assortmentSharePercent,
        item.revenueSharePercent,
        item.profitSharePercent,
      ]),
      [],
      ['ABC по прибыли'],
      [
        'Группа',
        'SKU',
        'Доля ассортимента, %',
        'Доля выручки, %',
        'Доля прибыли, %',
      ],
      ...skuPerformanceReport.abcByProfit.map((item) => [
        item.group,
        item.productsCount,
        item.assortmentSharePercent,
        item.revenueSharePercent,
        item.profitSharePercent,
      ]),
      [],
      ['ТОП SKU по выручке'],
      [
        'Артикул',
        'Товар',
        'Категория',
        'Поставщик',
        'Продано, шт',
        'Выручка',
        'Валовая прибыль',
        'Маржинальность, %',
        'Продажи на фейсинг',
        'Прибыль на фейсинг',
        'ABC выручка',
        'ABC прибыль',
      ],
      ...skuPerformanceReport.topByRevenue.map((item) => [
        item.article,
        item.name,
        item.categoryName,
        item.supplierName,
        item.soldQuantity,
        item.revenue,
        item.grossProfit,
        item.marginPercent,
        item.salesPerFacing,
        item.profitPerFacing,
        item.abcRevenueGroup,
        item.abcProfitGroup,
      ]),
      [],
      ['ТОП поставщиков'],
      [
        'Поставщик',
        'Активные SKU',
        'Продано, шт',
        'Выручка',
        'Валовая прибыль',
        'Маржинальность, %',
        'Доля продаж, %',
        'Доля прибыли, %',
        'Средняя выручка на SKU',
        'Отсрочка платежа, дней',
        'Минимальная сумма заказа',
        'Кратность заказа',
        'Списания, шт',
        'Списания, руб',
        'OOS SKU',
        'Медленные SKU',
        'SKU без продаж',
        'Заморожено денег',
        'Проблемная категория',
        'Качество поставок',
      ],
      ...suppliersPerformanceReport.rows.map((item) => [
        item.supplierName,
        item.activeSku,
        item.soldQuantity,
        item.revenue,
        item.grossProfit,
        item.marginPercent,
        item.salesSharePercent,
        item.profitSharePercent,
        item.averageRevenuePerSku,
        item.paymentDelayDays,
        item.minOrderAmount,
        item.orderMultiplicity,
        item.writeOffQuantity,
        item.writeOffAmount,
        item.oosSkuCount,
        item.slowSkuCount,
        item.frozenSkuCount,
        item.frozenStockAmount,
        item.problemCategoryName,
        item.deliveryQualityNote,
      ]),
      [],
      ['Сводка ассортимента'],
      ['Показатель', 'Значение'],
      ['Всего SKU', assortmentReport.totalSku],
      ['Активные SKU', assortmentReport.activeSku],
      ['Неактивные SKU', assortmentReport.inactiveSku],
      ['Средняя маржинальность, %', assortmentReport.averageMarginPercent],
      ['Средняя наценка, %', assortmentReport.averageMarkupPercent],
      [],
      ['Категории'],
      [
        'Название',
        'SKU',
        'Средняя маржинальность, %',
        'Средняя цена продажи',
        'Фейсинг',
      ],
      ...assortmentReport.categoryBreakdown.map((item) => [
        item.name,
        item.productsCount,
        item.averageMarginPercent,
        item.averageSalePrice,
        item.totalFacing,
      ]),
      [],
      ['Поставщики'],
      [
        'Название',
        'SKU',
        'Средняя маржинальность, %',
        'Средняя цена продажи',
        'Фейсинг',
      ],
      ...assortmentReport.supplierBreakdown.map((item) => [
        item.name,
        item.productsCount,
        item.averageMarginPercent,
        item.averageSalePrice,
        item.totalFacing,
      ]),
      [],
      ['SKU с низкой маржинальностью'],
      [
        'Артикул',
        'Товар',
        'Категория',
        'Поставщик',
        'Закупочная цена',
        'Цена продажи',
        'Маржинальность, %',
      ],
      ...assortmentReport.lowMarginProducts.map((item) => [
        item.article,
        item.name,
        item.categoryName,
        item.supplierName,
        item.purchasePrice,
        item.salePrice,
        item.marginPercent,
      ]),
    ];

    return `\uFEFF${rows.map((row) => this.csvRow(row)).join('\n')}`;
  }

  private buildReplenishmentCsv(report: ReplenishmentReport) {
    const rows: CsvCell[][] = [
      ['Остатки и потребность'],
      [`Период: ${report.from} - ${report.to}`],
      [],
      [
        'Статус',
        'Артикул',
        'Товар',
        'Клуб',
        'Категория',
        'Поставщик',
        'Остаток, шт',
        'Продано, шт',
        'Средние продажи в день',
        'Остаток в днях',
        'Потребность в день',
        'Рекомендованный заказ',
        'Кратность заказа',
      ],
      ...report.rows.map((item) => [
        this.replenishmentRiskLabel(item.risk),
        item.article,
        item.name,
        item.storeName,
        item.categoryName,
        item.supplierName,
        item.stockQuantity,
        item.soldQuantity,
        item.averageDailySales,
        item.stockDays,
        item.dailyNeed,
        item.recommendedOrder,
        item.orderMultiplicity,
      ]),
    ];

    return `\uFEFF${rows.map((row) => this.csvRow(row)).join('\n')}`;
  }

  private csvRow(row: CsvCell[]) {
    return row.map((cell) => this.csvCell(cell)).join(';');
  }

  private csvCell(cell: CsvCell) {
    const value = cell === null ? '' : String(cell);

    if (/[";\n\r]/.test(value)) {
      return `"${value.replaceAll('"', '""')}"`;
    }

    return value;
  }

  private async buildXlsx(
    assortmentReport: AssortmentReport,
    operationalReport: OperationalReport,
    salesDetailReport: SalesDetailReport,
    skuPerformanceReport: SkuPerformanceReport,
    replenishmentReport: ReplenishmentReport,
    suppliersPerformanceReport: SuppliersPerformanceReport,
  ) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LeetPlus';
    workbook.created = new Date();

    this.addSummarySheet(workbook, assortmentReport, operationalReport);
    this.addSalesDetailSheet(workbook, salesDetailReport);
    this.addRecommendationsSheet(workbook, operationalReport);
    this.addStockRiskSheet(workbook, operationalReport);
    this.addNoSalesSheet(workbook, operationalReport);
    this.addReplenishmentSheet(workbook, replenishmentReport);
    this.addAbcSheet(workbook, skuPerformanceReport);
    this.addTopSkuSheet(workbook, skuPerformanceReport);
    this.addTopSuppliersSheet(workbook, suppliersPerformanceReport);
    this.addAssortmentGroupsSheet(workbook, assortmentReport);
    this.addLowMarginSheet(workbook, assortmentReport);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private buildSalesDetailCsv(report: SalesDetailReport) {
    const rows: CsvCell[][] = [
      ['Общий отчет по продажам'],
      ['Организация', report.tenantSlug],
      ['Период', `${report.from} - ${report.to}`],
      ['Торговая точка', report.storeId ?? 'Все точки'],
      [],
      this.salesDetailHeaders().map((header) => header.header),
      ...report.rows.map((item) =>
        this.salesDetailHeaders().map((header) => item[header.key]),
      ),
    ];

    return `\uFEFF${rows.map((row) => this.csvRow(row)).join('\n')}`;
  }

  private async buildSalesDetailXlsx(report: SalesDetailReport) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LeetPlus';
    workbook.created = new Date();
    this.addSalesDetailSheet(workbook, report);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async buildReplenishmentXlsx(report: ReplenishmentReport) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LeetPlus';
    workbook.created = new Date();
    this.addReplenishmentSheet(workbook, report);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private buildProductMovementRows(
    salesReport: SalesDetailReport,
    replenishmentReport: ReplenishmentReport,
    category?: string,
  ) {
    const dates = this.dateRange(salesReport.from, salesReport.to);
    const stockByStoreProduct = new Map(
      replenishmentReport.rows.map((row) => [
        `${row.storeId}:${row.productId}`,
        row.stockQuantity,
      ]),
    );
    const rowsByKey = new Map<string, ProductMovementRow>();

    salesReport.rows.forEach((row) => {
      const categoryName = row.categoryName ?? 'Без категории';

      if (category && categoryName !== category) {
        return;
      }

      const key = `${row.storeId}:${row.productId}`;
      const date = row.saleDate.slice(0, 10);
      const current =
        rowsByKey.get(key) ??
        ({
          productName: row.productNameAtSale ?? row.productName,
          storeName: row.storeName,
          categoryName,
          totalQuantity: 0,
          stockQuantity: stockByStoreProduct.get(key) ?? 0,
          revenue: 0,
          dailyQuantity: Object.fromEntries(dates.map((day) => [day, 0])),
        } satisfies ProductMovementRow);

      current.totalQuantity += row.quantity;
      current.revenue += row.revenue;
      current.dailyQuantity[date] =
        (current.dailyQuantity[date] ?? 0) + row.quantity;
      rowsByKey.set(key, current);
    });

    return [...rowsByKey.values()]
      .map((row) => ({
        ...row,
        totalQuantity: this.round(row.totalQuantity),
        stockQuantity: this.round(row.stockQuantity),
        revenue: this.round(row.revenue),
      }))
      .sort(
        (a, b) =>
          b.revenue - a.revenue ||
          b.totalQuantity - a.totalQuantity ||
          a.productName.localeCompare(b.productName),
      );
  }

  private buildProductMovementCsv(
    report: SalesDetailReport,
    rows: ProductMovementRow[],
    category?: string,
  ) {
    const dates = this.dateRange(report.from, report.to);
    const csvRows: CsvCell[][] = [
      ['Движение товара'],
      ['Организация', report.tenantSlug],
      ['Период', `${report.from} - ${report.to}`],
      ['Торговая точка', report.storeId ?? 'Все точки'],
      ['Категория', category ?? 'Все категории'],
      [],
      [
        'Товар',
        'Клуб',
        'Категория',
        ...dates,
        'Итого продаж',
        'Остаток на текущий день',
        'Выручка',
      ],
      ...rows.map((row) => [
        row.productName,
        row.storeName,
        row.categoryName,
        ...dates.map((date) => row.dailyQuantity[date] ?? 0),
        row.totalQuantity,
        row.stockQuantity,
        row.revenue,
      ]),
    ];

    return `\uFEFF${csvRows.map((row) => this.csvRow(row)).join('\n')}`;
  }

  private async buildProductMovementXlsx(
    report: SalesDetailReport,
    rows: ProductMovementRow[],
    category?: string,
  ) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LeetPlus';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Движение товара');
    const dates = this.dateRange(report.from, report.to);

    sheet.columns = [
      { header: 'Товар', key: 'productName', width: 36 },
      { header: 'Клуб', key: 'storeName', width: 24 },
      { header: 'Категория', key: 'categoryName', width: 24 },
      ...dates.map((date) => ({ header: date, key: date, width: 12 })),
      { header: 'Итого продаж', key: 'totalQuantity', width: 16 },
      {
        header: 'Остаток на текущий день',
        key: 'stockQuantity',
        width: 22,
      },
      { header: 'Выручка', key: 'revenue', width: 16 },
    ];
    sheet.addRows(
      rows.map((row) => ({
        productName: row.productName,
        storeName: row.storeName,
        categoryName: row.categoryName,
        ...row.dailyQuantity,
        totalQuantity: row.totalQuantity,
        stockQuantity: row.stockQuantity,
        revenue: row.revenue,
      })),
    );
    sheet.spliceRows(1, 0, ['Движение товара']);
    sheet.spliceRows(2, 0, ['Организация', report.tenantSlug]);
    sheet.spliceRows(3, 0, ['Период', `${report.from} - ${report.to}`]);
    sheet.spliceRows(4, 0, ['Торговая точка', report.storeId ?? 'Все точки']);
    sheet.spliceRows(5, 0, ['Категория', category ?? 'Все категории']);
    this.styleHeader(sheet, 7);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private dateRange(from: string, to: string) {
    const dates: string[] = [];
    const current = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);

    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private addSummarySheet(
    workbook: ExcelJS.Workbook,
    assortmentReport: AssortmentReport,
    operationalReport: OperationalReport,
  ) {
    const sheet = workbook.addWorksheet('Сводка');
    sheet.columns = [
      { header: 'Раздел', key: 'section', width: 24 },
      { header: 'Показатель', key: 'metric', width: 36 },
      { header: 'Значение', key: 'value', width: 24 },
    ];
    sheet.addRows([
      {
        section: 'Контекст',
        metric: 'Организация',
        value: operationalReport.tenantSlug,
      },
      {
        section: 'Контекст',
        metric: 'Период',
        value: `${operationalReport.from} - ${operationalReport.to}`,
      },
      {
        section: 'Контекст',
        metric: 'Торговая точка',
        value: operationalReport.storeId ?? 'Все точки',
      },
      {
        section: 'Операции',
        metric: 'Выручка',
        value: operationalReport.totalRevenue,
      },
      {
        section: 'Операции',
        metric: 'Себестоимость',
        value: operationalReport.totalCost,
      },
      {
        section: 'Операции',
        metric: 'Валовая прибыль',
        value: operationalReport.grossProfit,
      },
      {
        section: 'Операции',
        metric: 'Прибыль с учетом потерь',
        value: operationalReport.adjustedGrossProfit,
      },
      {
        section: 'Операции',
        metric: 'Маржинальность, %',
        value: operationalReport.marginPercent,
      },
      {
        section: 'Операции',
        metric: 'Маржинальность с учетом потерь, %',
        value: operationalReport.adjustedMarginPercent,
      },
      {
        section: 'Операции',
        metric: 'Продано, шт',
        value: operationalReport.soldQuantity,
      },
      {
        section: 'Операции',
        metric: 'Списания, шт',
        value: operationalReport.writeOffQuantity,
      },
      {
        section: 'Операции',
        metric: 'Списания, сумма',
        value: operationalReport.writeOffAmount,
      },
      {
        section: 'Операции',
        metric: 'Возвраты, шт',
        value: operationalReport.returnQuantity,
      },
      {
        section: 'Операции',
        metric: 'Возвраты, сумма',
        value: operationalReport.returnAmount,
      },
      {
        section: 'Операции',
        metric: 'Среднедневная выручка',
        value: operationalReport.averageDailyRevenue,
      },
      {
        section: 'Операции',
        metric: 'Остатки, шт',
        value: operationalReport.stockQuantity,
      },
      {
        section: 'Операции',
        metric: 'Остаток в днях',
        value: operationalReport.stockDays ?? '',
      },
      {
        section: 'Ассортимент',
        metric: 'Всего SKU',
        value: assortmentReport.totalSku,
      },
      {
        section: 'Ассортимент',
        metric: 'Активные SKU',
        value: assortmentReport.activeSku,
      },
      {
        section: 'Ассортимент',
        metric: 'Неактивные SKU',
        value: assortmentReport.inactiveSku,
      },
      {
        section: 'Ассортимент',
        metric: 'Средняя маржинальность, %',
        value: assortmentReport.averageMarginPercent,
      },
      {
        section: 'Ассортимент',
        metric: 'Средняя наценка, %',
        value: assortmentReport.averageMarkupPercent,
      },
    ]);
    this.styleHeader(sheet);
  }

  private addSalesDetailSheet(
    workbook: ExcelJS.Workbook,
    report: SalesDetailReport,
  ) {
    const sheet = workbook.addWorksheet('Общий отчет по продажам');
    sheet.columns = this.salesDetailHeaders();
    sheet.addRows(report.rows);
    this.styleHeader(sheet);
  }

  private salesDetailHeaders(): SalesDetailColumn[] {
    return [
      { header: 'Дата продажи', key: 'saleDate', width: 22 },
      { header: 'Клуб', key: 'storeName', width: 24 },
      { header: 'Клуб при продаже', key: 'storeNameAtSale', width: 24 },
      { header: 'Артикул', key: 'article', width: 18 },
      { header: 'Товар', key: 'productName', width: 36 },
      { header: 'Товар при продаже', key: 'productNameAtSale', width: 36 },
      { header: 'Категория', key: 'categoryName', width: 24 },
      { header: 'Поставщик', key: 'supplierName', width: 24 },
      { header: 'Продажи, шт', key: 'quantity', width: 14 },
      { header: 'Выручка', key: 'revenue', width: 14 },
      { header: 'Себестоимость', key: 'cost', width: 16 },
      { header: 'Цена продажи за ед.', key: 'unitSalePrice', width: 18 },
      { header: 'Себестоимость за ед.', key: 'unitCost', width: 20 },
      { header: 'Прибыль', key: 'grossProfit', width: 14 },
      { header: 'Маржа, %', key: 'marginPercent', width: 12 },
      { header: 'Наценка, %', key: 'markupPercent', width: 12 },
      { header: 'Прайс закупки', key: 'purchasePrice', width: 14 },
      { header: 'Прайс продажи', key: 'salePrice', width: 14 },
      { header: 'Фейсинг', key: 'facing', width: 10 },
      { header: 'Источник', key: 'source', width: 16 },
      { header: 'Внешний провайдер', key: 'externalProvider', width: 18 },
      { header: 'Домен источника', key: 'externalDomain', width: 20 },
      { header: 'ID продажи источника', key: 'externalSaleId', width: 24 },
      { header: 'ID товара источника', key: 'externalProductId', width: 22 },
      { header: 'ID клуба источника', key: 'externalClubId', width: 20 },
      { header: 'Хеш строки источника', key: 'sourcePayloadHash', width: 28 },
      { header: 'Отменена', key: 'isCanceled', width: 10 },
      { header: 'Дата отмены', key: 'canceledAt', width: 22 },
      { header: 'ID продажи', key: 'id', width: 38 },
      { header: 'ID товара', key: 'productId', width: 38 },
      { header: 'ID клуба', key: 'storeId', width: 38 },
      { header: 'Создано', key: 'createdAt', width: 22 },
      { header: 'Обновлено', key: 'updatedAt', width: 22 },
    ];
  }

  private addRecommendationsSheet(
    workbook: ExcelJS.Workbook,
    operationalReport: OperationalReport,
  ) {
    const sheet = workbook.addWorksheet('Рекомендации');
    sheet.columns = [
      { header: 'Приоритет', key: 'severity', width: 14 },
      { header: 'Статус', key: 'status', width: 18 },
      { header: 'Ответственный', key: 'role', width: 24 },
      { header: 'Тип', key: 'kind', width: 20 },
      { header: 'Артикул', key: 'article', width: 18 },
      { header: 'Товар', key: 'productName', width: 36 },
      { header: 'Эффект, руб', key: 'effectAmount', width: 16 },
      { header: 'Тип эффекта', key: 'effectLabel', width: 24 },
      { header: 'Показатель', key: 'metricLabel', width: 18 },
      { header: 'Значение', key: 'metricValue', width: 16 },
      { header: 'Действие', key: 'action', width: 42 },
      { header: 'Описание', key: 'description', width: 56 },
    ];
    sheet.addRows(
      operationalReport.recommendations.map((item) => ({
        ...item,
        severity: this.recommendationSeverityLabel(item.severity),
        status: this.recommendationStatusLabel(item.status),
        role: this.recommendationRoleLabel(item.role),
        kind: this.recommendationKindLabel(item.kind),
      })),
    );
    this.styleHeader(sheet);
  }

  private addStockRiskSheet(
    workbook: ExcelJS.Workbook,
    operationalReport: OperationalReport,
  ) {
    const sheet = workbook.addWorksheet('Риск OOS');
    sheet.columns = [
      { header: 'Клуб', key: 'storeName', width: 24 },
      { header: 'Артикул', key: 'article', width: 18 },
      { header: 'Товар', key: 'name', width: 36 },
      { header: 'Поставщик', key: 'supplierName', width: 24 },
      { header: 'Остаток, шт', key: 'stockQuantity', width: 18 },
      { header: 'Средние продажи в день', key: 'averageDailySales', width: 24 },
      {
        header: 'Выручка в риске / день',
        key: 'revenueAtRiskPerDay',
        width: 24,
      },
      {
        header: 'Прибыль в риске / день',
        key: 'grossProfitAtRiskPerDay',
        width: 24,
      },
      {
        header: 'Прибыль в риске за период',
        key: 'grossProfitAtRiskForPeriod',
        width: 26,
      },
      { header: 'Остаток в днях', key: 'stockDays', width: 18 },
    ];
    sheet.addRows(operationalReport.outOfStockRiskProducts);
    this.styleHeader(sheet);
  }

  private addNoSalesSheet(
    workbook: ExcelJS.Workbook,
    operationalReport: OperationalReport,
  ) {
    const sheet = workbook.addWorksheet('Без продаж');
    sheet.columns = [
      { header: 'Артикул', key: 'article', width: 18 },
      { header: 'Товар', key: 'name', width: 36 },
      { header: 'Категория', key: 'categoryName', width: 24 },
      { header: 'Поставщик', key: 'supplierName', width: 24 },
      { header: 'Остаток, шт', key: 'stockQuantity', width: 18 },
      { header: 'Оценка, руб/шт', key: 'frozenStockUnitValue', width: 18 },
      { header: 'Источник оценки', key: 'frozenStockValuation', width: 28 },
      { header: 'Заморожено денег', key: 'frozenStockAmount', width: 20 },
    ];
    sheet.addRows(
      operationalReport.productsWithoutSales.map((item) => ({
        ...item,
        frozenStockValuation: this.frozenStockValuationLabel(
          item.frozenStockValuation,
        ),
      })),
    );
    this.styleHeader(sheet);
  }

  private addReplenishmentSheet(
    workbook: ExcelJS.Workbook,
    replenishmentReport: ReplenishmentReport,
  ) {
    const sheet = workbook.addWorksheet('Потребность');
    sheet.columns = [
      { header: 'Риск', key: 'risk', width: 18 },
      { header: 'Артикул', key: 'article', width: 18 },
      { header: 'Товар', key: 'name', width: 36 },
      { header: 'Категория', key: 'categoryName', width: 24 },
      { header: 'Поставщик', key: 'supplierName', width: 24 },
      { header: 'Остаток, шт', key: 'stockQuantity', width: 18 },
      { header: 'Продано, шт', key: 'soldQuantity', width: 14 },
      { header: 'Средние продажи в день', key: 'averageDailySales', width: 24 },
      { header: 'Остаток в днях', key: 'stockDays', width: 18 },
      { header: 'Потребность в день', key: 'dailyNeed', width: 18 },
      { header: 'Рекомендованный заказ', key: 'recommendedOrder', width: 22 },
      { header: 'Кратность заказа', key: 'orderMultiplicity', width: 18 },
    ];
    sheet.addRows(
      replenishmentReport.rows.map((item) => ({
        ...item,
        risk: this.replenishmentRiskLabel(item.risk),
      })),
    );
    this.styleHeader(sheet);
  }

  private addAbcSheet(
    workbook: ExcelJS.Workbook,
    skuPerformanceReport: SkuPerformanceReport,
  ) {
    const sheet = workbook.addWorksheet('ABC');
    sheet.columns = [
      { header: 'Основа ABC', key: 'basis', width: 18 },
      { header: 'Группа', key: 'group', width: 10 },
      { header: 'SKU', key: 'productsCount', width: 12 },
      {
        header: 'Доля ассортимента, %',
        key: 'assortmentSharePercent',
        width: 22,
      },
      { header: 'Доля выручки, %', key: 'revenueSharePercent', width: 20 },
      { header: 'Доля прибыли, %', key: 'profitSharePercent', width: 18 },
    ];
    sheet.addRows([
      ...skuPerformanceReport.abcByRevenue.map((item) => ({
        basis: 'Выручка',
        ...item,
      })),
      ...skuPerformanceReport.abcByProfit.map((item) => ({
        basis: 'Прибыль',
        ...item,
      })),
    ]);
    this.styleHeader(sheet);
  }

  private addTopSkuSheet(
    workbook: ExcelJS.Workbook,
    skuPerformanceReport: SkuPerformanceReport,
  ) {
    const sheet = workbook.addWorksheet('ТОП SKU');
    sheet.columns = [
      { header: 'Артикул', key: 'article', width: 18 },
      { header: 'Товар', key: 'name', width: 36 },
      { header: 'Категория', key: 'categoryName', width: 24 },
      { header: 'Поставщик', key: 'supplierName', width: 24 },
      { header: 'Продано, шт', key: 'soldQuantity', width: 14 },
      { header: 'Выручка', key: 'revenue', width: 16 },
      { header: 'Валовая прибыль', key: 'grossProfit', width: 18 },
      { header: 'Маржинальность, %', key: 'marginPercent', width: 18 },
      { header: 'Продажи на фейсинг', key: 'salesPerFacing', width: 20 },
      { header: 'Прибыль на фейсинг', key: 'profitPerFacing', width: 20 },
      { header: 'ABC выручка', key: 'abcRevenueGroup', width: 14 },
      { header: 'ABC прибыль', key: 'abcProfitGroup', width: 14 },
    ];
    sheet.addRows(skuPerformanceReport.topByRevenue);
    this.styleHeader(sheet);
  }

  private addTopSuppliersSheet(
    workbook: ExcelJS.Workbook,
    suppliersPerformanceReport: SuppliersPerformanceReport,
  ) {
    const sheet = workbook.addWorksheet('ТОП поставщики');
    sheet.columns = [
      { header: 'Поставщик', key: 'supplierName', width: 32 },
      { header: 'Активные SKU', key: 'activeSku', width: 14 },
      { header: 'Продано, шт', key: 'soldQuantity', width: 14 },
      { header: 'Выручка', key: 'revenue', width: 16 },
      { header: 'Валовая прибыль', key: 'grossProfit', width: 18 },
      { header: 'Маржинальность, %', key: 'marginPercent', width: 18 },
      { header: 'Доля продаж, %', key: 'salesSharePercent', width: 18 },
      { header: 'Доля прибыли, %', key: 'profitSharePercent', width: 18 },
      {
        header: 'Средняя выручка на SKU',
        key: 'averageRevenuePerSku',
        width: 24,
      },
      { header: 'Отсрочка платежа, дней', key: 'paymentDelayDays', width: 22 },
      { header: 'Минимальная сумма заказа', key: 'minOrderAmount', width: 24 },
      { header: 'Кратность заказа', key: 'orderMultiplicity', width: 18 },
      { header: 'Списания, шт', key: 'writeOffQuantity', width: 16 },
      { header: 'Списания, руб', key: 'writeOffAmount', width: 18 },
      { header: 'OOS SKU', key: 'oosSkuCount', width: 14 },
      { header: 'Медленные SKU', key: 'slowSkuCount', width: 16 },
      { header: 'SKU без продаж', key: 'frozenSkuCount', width: 18 },
      { header: 'Заморожено денег', key: 'frozenStockAmount', width: 20 },
      { header: 'Проблемная категория', key: 'problemCategoryName', width: 24 },
      { header: 'Качество поставок', key: 'deliveryQualityNote', width: 42 },
    ];
    sheet.addRows(suppliersPerformanceReport.rows);
    this.styleHeader(sheet);
  }

  private addAssortmentGroupsSheet(
    workbook: ExcelJS.Workbook,
    assortmentReport: AssortmentReport,
  ) {
    const sheet = workbook.addWorksheet('Группы ассортимента');
    sheet.columns = [
      { header: 'Тип группы', key: 'groupType', width: 18 },
      { header: 'Название', key: 'name', width: 32 },
      { header: 'SKU', key: 'productsCount', width: 12 },
      {
        header: 'Средняя маржинальность, %',
        key: 'averageMarginPercent',
        width: 24,
      },
      { header: 'Средняя цена продажи', key: 'averageSalePrice', width: 22 },
      { header: 'Фейсинг', key: 'totalFacing', width: 14 },
    ];
    sheet.addRows([
      ...assortmentReport.categoryBreakdown.map((item) => ({
        groupType: 'Категория',
        ...item,
      })),
      ...assortmentReport.supplierBreakdown.map((item) => ({
        groupType: 'Поставщик',
        ...item,
      })),
    ]);
    this.styleHeader(sheet);
  }

  private addLowMarginSheet(
    workbook: ExcelJS.Workbook,
    assortmentReport: AssortmentReport,
  ) {
    const sheet = workbook.addWorksheet('Низкая маржа');
    sheet.columns = [
      { header: 'Артикул', key: 'article', width: 18 },
      { header: 'Товар', key: 'name', width: 36 },
      { header: 'Категория', key: 'categoryName', width: 24 },
      { header: 'Поставщик', key: 'supplierName', width: 24 },
      { header: 'Закупочная цена', key: 'purchasePrice', width: 18 },
      { header: 'Цена продажи', key: 'salePrice', width: 16 },
      { header: 'Маржинальность, %', key: 'marginPercent', width: 18 },
    ];
    sheet.addRows(assortmentReport.lowMarginProducts);
    this.styleHeader(sheet);
  }

  private buildLflCsv(report: LflReport) {
    const rows: CsvCell[][] = [
      ['Отчет LeetPlus LFL'],
      ['Организация', report.tenantSlug],
      ['Период', this.lflPeriodLabel(report.period)],
      ['Текущий период', `${report.currentFrom} - ${report.currentTo}`],
      ['Предыдущий период', `${report.previousFrom} - ${report.previousTo}`],
      [],
      [
        'Уровень',
        'Родительская группа',
        'Название',
        'Текущая выручка',
        'Выручка год назад',
        'Отклонение выручки',
        'LFL выручки, %',
        'Текущая валовая прибыль',
        'Валовая прибыль год назад',
        'Отклонение валовой прибыли',
        'LFL валовой прибыли, %',
        'Текущие продажи, шт',
        'Продажи год назад, шт',
        'Отклонение продаж, шт',
        'LFL продаж, %',
      ],
      ...[report.summary, ...report.rows].map((item) => [
        this.lflLevelLabel(item.level),
        item.parentId,
        item.name,
        item.currentRevenue,
        item.previousRevenue,
        item.revenueDelta,
        item.revenueLflPercent,
        item.currentGrossProfit,
        item.previousGrossProfit,
        item.grossProfitDelta,
        item.grossProfitLflPercent,
        item.currentQuantity,
        item.previousQuantity,
        item.quantityDelta,
        item.quantityLflPercent,
      ]),
    ];

    return `\uFEFF${rows.map((row) => this.csvRow(row)).join('\n')}`;
  }

  private async buildLflXlsx(report: LflReport) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LeetPlus';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('LFL год к году');
    sheet.columns = [
      { header: 'Уровень', key: 'level', width: 14 },
      { header: 'Родительская группа', key: 'parentId', width: 22 },
      { header: 'Название', key: 'name', width: 36 },
      { header: 'Текущая выручка', key: 'currentRevenue', width: 18 },
      { header: 'Выручка год назад', key: 'previousRevenue', width: 20 },
      { header: 'Отклонение выручки', key: 'revenueDelta', width: 20 },
      { header: 'LFL выручки, %', key: 'revenueLflPercent', width: 16 },
      {
        header: 'Текущая валовая прибыль',
        key: 'currentGrossProfit',
        width: 24,
      },
      {
        header: 'Валовая прибыль год назад',
        key: 'previousGrossProfit',
        width: 26,
      },
      {
        header: 'Отклонение валовой прибыли',
        key: 'grossProfitDelta',
        width: 28,
      },
      {
        header: 'LFL валовой прибыли, %',
        key: 'grossProfitLflPercent',
        width: 24,
      },
      { header: 'Текущие продажи, шт', key: 'currentQuantity', width: 20 },
      { header: 'Продажи год назад, шт', key: 'previousQuantity', width: 22 },
      { header: 'Отклонение продаж, шт', key: 'quantityDelta', width: 22 },
      { header: 'LFL продаж, %', key: 'quantityLflPercent', width: 16 },
    ];
    sheet.addRows(
      [report.summary, ...report.rows].map((item) => ({
        ...item,
        level: this.lflLevelLabel(item.level),
      })),
    );
    this.styleHeader(sheet);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private styleHeader(sheet: ExcelJS.Worksheet, rowNumber = 1) {
    const header = sheet.getRow(rowNumber);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle' };
    sheet.views = [{ state: 'frozen', ySplit: rowNumber }];
  }

  private recommendationSeverityLabel(
    severity: ReportRecommendation['severity'],
  ) {
    const labels: Record<ReportRecommendation['severity'], string> = {
      HIGH: 'Высокий',
      MEDIUM: 'Средний',
      LOW: 'Низкий',
    };

    return labels[severity];
  }

  private recommendationKindLabel(kind: ReportRecommendation['kind']) {
    const labels: Record<ReportRecommendation['kind'], string> = {
      REPLENISH_STOCK: 'Пополнить запас',
      NO_SALES: 'Нет продаж',
      LOW_MARGIN: 'Низкая маржинальность',
    };

    return labels[kind];
  }

  private recommendationStatusLabel(status: ReportRecommendation['status']) {
    const labels: Record<ReportRecommendation['status'], string> = {
      NEW: 'Новая',
      IN_PROGRESS: 'В работе',
      DONE: 'Выполнена',
      REJECTED: 'Отклонена',
      HIDDEN: 'Скрыта',
      REAPPEARED: 'Появилась повторно',
    };

    return labels[status];
  }

  private recommendationRoleLabel(role: ReportRecommendation['role']) {
    const labels: Record<ReportRecommendation['role'], string> = {
      COMMERCIAL_DIRECTOR: 'Коммерческий директор',
      BUYER: 'Закупщик',
      CLUB_MANAGER: 'Управляющий клуба',
    };

    return labels[role];
  }

  private replenishmentRiskLabel(risk: ReplenishmentRisk) {
    const labels: Record<ReplenishmentRisk, string> = {
      OUT_OF_STOCK: 'Нет остатка',
      LOW_STOCK: 'Низкий остаток',
      OK: 'В норме',
      NO_SALES: 'Нет продаж',
    };

    return labels[risk];
  }

  private frozenStockValuationLabel(
    valuation: OperationalReport['productsWithoutSales'][number]['frozenStockValuation'],
  ) {
    const labels: Record<
      OperationalReport['productsWithoutSales'][number]['frozenStockValuation'],
      string
    > = {
      PURCHASE_PRICE: 'Закупочная цена',
      SALE_PRICE: 'Цена продажи',
      HISTORICAL_REVENUE: 'Историческая цена продажи',
      UNKNOWN: 'Нет оценки',
    };

    return labels[valuation];
  }

  private lflPeriodLabel(period: LflPeriod) {
    const labels: Record<LflPeriod, string> = {
      day: 'День',
      week: 'Неделя',
      month: 'Месяц',
    };

    return labels[period];
  }

  private lflLevelLabel(level: LflGroupLevel) {
    const labels: Record<LflGroupLevel, string> = {
      network: 'Вся сеть',
      store: 'Клуб',
      category: 'Категория',
      product: 'Товар',
    };

    return labels[level];
  }
}

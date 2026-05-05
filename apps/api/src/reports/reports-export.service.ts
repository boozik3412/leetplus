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
  type ReplenishmentRisk,
  type SkuPerformanceReport,
  type SuppliersPerformanceReport,
} from './reports.service';

export type ReportExportFormat = 'csv' | 'xlsx';

export type ReportExportQuery = OperationalReportQuery & {
  format?: string;
  report?: string;
  lflPeriod?: LflPeriod;
};

export type ReportExportFile = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  tenantSlug: string;
  from: string;
  to: string;
};

type CsvCell = string | number | null;

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

    const [
      assortmentReport,
      operationalReport,
      skuPerformanceReport,
      replenishmentReport,
      suppliersPerformanceReport,
    ] = await Promise.all([
      this.reportsService.getAssortmentReport(user),
      this.reportsService.getOperationalReport(user, query),
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
      ['Рекомендации'],
      [
        'Приоритет',
        'Тип',
        'Артикул',
        'Товар',
        'Показатель',
        'Значение',
        'Действие',
        'Описание',
      ],
      ...operationalReport.recommendations.map((item) => [
        this.recommendationSeverityLabel(item.severity),
        this.recommendationKindLabel(item.kind),
        item.article,
        item.productName,
        item.metricLabel,
        item.metricValue,
        item.action,
        item.description,
      ]),
      [],
      ['Риск out-of-stock'],
      [
        'Артикул',
        'Товар',
        'Остаток, шт',
        'Средние продажи в день',
        'Остаток в днях',
      ],
      ...operationalReport.outOfStockRiskProducts.map((item) => [
        item.article,
        item.name,
        item.stockQuantity,
        item.averageDailySales,
        item.stockDays,
      ]),
      [],
      ['Товары без продаж'],
      ['Артикул', 'Товар', 'Категория', 'Поставщик', 'Остаток, шт'],
      ...operationalReport.productsWithoutSales.map((item) => [
        item.article,
        item.name,
        item.categoryName,
        item.supplierName,
        item.stockQuantity,
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
      ['Название', 'SKU', 'Средняя маржинальность, %', 'Средняя цена продажи', 'Фейсинг'],
      ...assortmentReport.categoryBreakdown.map((item) => [
        item.name,
        item.productsCount,
        item.averageMarginPercent,
        item.averageSalePrice,
        item.totalFacing,
      ]),
      [],
      ['Поставщики'],
      ['Название', 'SKU', 'Средняя маржинальность, %', 'Средняя цена продажи', 'Фейсинг'],
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
    skuPerformanceReport: SkuPerformanceReport,
    replenishmentReport: ReplenishmentReport,
    suppliersPerformanceReport: SuppliersPerformanceReport,
  ) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LeetPlus';
    workbook.created = new Date();

    this.addSummarySheet(workbook, assortmentReport, operationalReport);
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

  private addRecommendationsSheet(
    workbook: ExcelJS.Workbook,
    operationalReport: OperationalReport,
  ) {
    const sheet = workbook.addWorksheet('Рекомендации');
    sheet.columns = [
      { header: 'Приоритет', key: 'severity', width: 14 },
      { header: 'Тип', key: 'kind', width: 20 },
      { header: 'Артикул', key: 'article', width: 18 },
      { header: 'Товар', key: 'productName', width: 36 },
      { header: 'Показатель', key: 'metricLabel', width: 18 },
      { header: 'Значение', key: 'metricValue', width: 16 },
      { header: 'Действие', key: 'action', width: 42 },
      { header: 'Описание', key: 'description', width: 56 },
    ];
    sheet.addRows(
      operationalReport.recommendations.map((item) => ({
        ...item,
        severity: this.recommendationSeverityLabel(item.severity),
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
      { header: 'Артикул', key: 'article', width: 18 },
      { header: 'Товар', key: 'name', width: 36 },
      { header: 'Остаток, шт', key: 'stockQuantity', width: 18 },
      { header: 'Средние продажи в день', key: 'averageDailySales', width: 24 },
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
    ];
    sheet.addRows(operationalReport.productsWithoutSales);
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
      { header: 'Средняя маржинальность, %', key: 'averageMarginPercent', width: 24 },
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
      { header: 'Текущая валовая прибыль', key: 'currentGrossProfit', width: 24 },
      { header: 'Валовая прибыль год назад', key: 'previousGrossProfit', width: 26 },
      { header: 'Отклонение валовой прибыли', key: 'grossProfitDelta', width: 28 },
      { header: 'LFL валовой прибыли, %', key: 'grossProfitLflPercent', width: 24 },
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

  private styleHeader(sheet: ExcelJS.Worksheet) {
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
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

  private replenishmentRiskLabel(risk: ReplenishmentRisk) {
    const labels: Record<ReplenishmentRisk, string> = {
      OUT_OF_STOCK: 'Нет остатка',
      LOW_STOCK: 'Низкий остаток',
      OK: 'В норме',
      NO_SALES: 'Нет продаж',
    };

    return labels[risk];
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

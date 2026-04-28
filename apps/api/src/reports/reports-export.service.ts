import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ReportsService,
  type AssortmentReport,
  type OperationalReport,
  type OperationalReportQuery,
  type SkuPerformanceReport,
  type SuppliersPerformanceReport,
} from './reports.service';

export type ReportExportFormat = 'csv' | 'xlsx';

export type ReportExportQuery = OperationalReportQuery & {
  format?: string;
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
    const [
      assortmentReport,
      operationalReport,
      skuPerformanceReport,
      suppliersPerformanceReport,
    ] = await Promise.all([
      this.reportsService.getAssortmentReport(user),
      this.reportsService.getOperationalReport(user, query),
      this.reportsService.getSkuPerformanceReport(user, query),
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

  private resolveFormat(format?: string): ReportExportFormat {
    if (!format || format === 'csv') {
      return 'csv';
    }

    if (format === 'xlsx') {
      return 'xlsx';
    }

    throw new BadRequestException('format must be csv or xlsx');
  }

  private buildCsv(
    assortmentReport: AssortmentReport,
    operationalReport: OperationalReport,
    skuPerformanceReport: SkuPerformanceReport,
    suppliersPerformanceReport: SuppliersPerformanceReport,
  ) {
    const rows: CsvCell[][] = [
      ['LeetPlus reports'],
      ['Tenant', operationalReport.tenantSlug],
      ['Period', `${operationalReport.from} - ${operationalReport.to}`],
      ['Store ID', operationalReport.storeId ?? 'All stores'],
      [],
      ['Operations summary'],
      ['Metric', 'Value'],
      ['Revenue', operationalReport.totalRevenue],
      ['Cost', operationalReport.totalCost],
      ['Gross profit', operationalReport.grossProfit],
      ['Sales margin, %', operationalReport.marginPercent],
      ['Sold quantity', operationalReport.soldQuantity],
      ['Average daily revenue', operationalReport.averageDailyRevenue],
      ['Stock quantity', operationalReport.stockQuantity],
      ['Stock days', operationalReport.stockDays],
      [],
      ['Recommendations'],
      [
        'Severity',
        'Kind',
        'Article',
        'Product',
        'Metric',
        'Value',
        'Action',
        'Description',
      ],
      ...operationalReport.recommendations.map((item) => [
        item.severity,
        item.kind,
        item.article,
        item.productName,
        item.metricLabel,
        item.metricValue,
        item.action,
        item.description,
      ]),
      [],
      ['Out of stock risk'],
      [
        'Article',
        'Product',
        'Stock quantity',
        'Average daily sales',
        'Stock days',
      ],
      ...operationalReport.outOfStockRiskProducts.map((item) => [
        item.article,
        item.name,
        item.stockQuantity,
        item.averageDailySales,
        item.stockDays,
      ]),
      [],
      ['Products without sales'],
      ['Article', 'Product', 'Category', 'Supplier', 'Stock quantity'],
      ...operationalReport.productsWithoutSales.map((item) => [
        item.article,
        item.name,
        item.categoryName,
        item.supplierName,
        item.stockQuantity,
      ]),
      [],
      ['ABC by revenue'],
      [
        'Group',
        'SKU',
        'Assortment share, %',
        'Revenue share, %',
        'Profit share, %',
      ],
      ...skuPerformanceReport.abcByRevenue.map((item) => [
        item.group,
        item.productsCount,
        item.assortmentSharePercent,
        item.revenueSharePercent,
        item.profitSharePercent,
      ]),
      [],
      ['ABC by profit'],
      [
        'Group',
        'SKU',
        'Assortment share, %',
        'Revenue share, %',
        'Profit share, %',
      ],
      ...skuPerformanceReport.abcByProfit.map((item) => [
        item.group,
        item.productsCount,
        item.assortmentSharePercent,
        item.revenueSharePercent,
        item.profitSharePercent,
      ]),
      [],
      ['Top SKU by revenue'],
      [
        'Article',
        'Product',
        'Category',
        'Supplier',
        'Quantity',
        'Revenue',
        'Gross profit',
        'Margin, %',
        'Sales/facing',
        'Profit/facing',
        'ABC revenue',
        'ABC profit',
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
      ['Top suppliers'],
      [
        'Supplier',
        'Active SKU',
        'Quantity',
        'Revenue',
        'Gross profit',
        'Margin, %',
        'Sales share, %',
        'Profit share, %',
        'Average revenue/SKU',
        'Payment delay days',
        'Min order amount',
        'Order multiplicity',
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
      ['Assortment summary'],
      ['Metric', 'Value'],
      ['Total SKU', assortmentReport.totalSku],
      ['Active SKU', assortmentReport.activeSku],
      ['Inactive SKU', assortmentReport.inactiveSku],
      ['Average margin, %', assortmentReport.averageMarginPercent],
      ['Average markup, %', assortmentReport.averageMarkupPercent],
      [],
      ['Categories'],
      ['Name', 'SKU', 'Average margin, %', 'Average sale price', 'Facing'],
      ...assortmentReport.categoryBreakdown.map((item) => [
        item.name,
        item.productsCount,
        item.averageMarginPercent,
        item.averageSalePrice,
        item.totalFacing,
      ]),
      [],
      ['Suppliers'],
      ['Name', 'SKU', 'Average margin, %', 'Average sale price', 'Facing'],
      ...assortmentReport.supplierBreakdown.map((item) => [
        item.name,
        item.productsCount,
        item.averageMarginPercent,
        item.averageSalePrice,
        item.totalFacing,
      ]),
      [],
      ['Low margin SKU'],
      [
        'Article',
        'Product',
        'Category',
        'Supplier',
        'Purchase price',
        'Sale price',
        'Margin, %',
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
    suppliersPerformanceReport: SuppliersPerformanceReport,
  ) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LeetPlus';
    workbook.created = new Date();

    this.addSummarySheet(workbook, assortmentReport, operationalReport);
    this.addRecommendationsSheet(workbook, operationalReport);
    this.addStockRiskSheet(workbook, operationalReport);
    this.addNoSalesSheet(workbook, operationalReport);
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
    const sheet = workbook.addWorksheet('Summary');
    sheet.columns = [
      { header: 'Section', key: 'section', width: 24 },
      { header: 'Metric', key: 'metric', width: 32 },
      { header: 'Value', key: 'value', width: 24 },
    ];
    sheet.addRows([
      {
        section: 'Context',
        metric: 'Tenant',
        value: operationalReport.tenantSlug,
      },
      {
        section: 'Context',
        metric: 'Period',
        value: `${operationalReport.from} - ${operationalReport.to}`,
      },
      {
        section: 'Context',
        metric: 'Store ID',
        value: operationalReport.storeId ?? 'All stores',
      },
      {
        section: 'Operations',
        metric: 'Revenue',
        value: operationalReport.totalRevenue,
      },
      {
        section: 'Operations',
        metric: 'Cost',
        value: operationalReport.totalCost,
      },
      {
        section: 'Operations',
        metric: 'Gross profit',
        value: operationalReport.grossProfit,
      },
      {
        section: 'Operations',
        metric: 'Sales margin, %',
        value: operationalReport.marginPercent,
      },
      {
        section: 'Operations',
        metric: 'Sold quantity',
        value: operationalReport.soldQuantity,
      },
      {
        section: 'Operations',
        metric: 'Average daily revenue',
        value: operationalReport.averageDailyRevenue,
      },
      {
        section: 'Operations',
        metric: 'Stock quantity',
        value: operationalReport.stockQuantity,
      },
      {
        section: 'Operations',
        metric: 'Stock days',
        value: operationalReport.stockDays ?? '',
      },
      {
        section: 'Assortment',
        metric: 'Total SKU',
        value: assortmentReport.totalSku,
      },
      {
        section: 'Assortment',
        metric: 'Active SKU',
        value: assortmentReport.activeSku,
      },
      {
        section: 'Assortment',
        metric: 'Inactive SKU',
        value: assortmentReport.inactiveSku,
      },
      {
        section: 'Assortment',
        metric: 'Average margin, %',
        value: assortmentReport.averageMarginPercent,
      },
      {
        section: 'Assortment',
        metric: 'Average markup, %',
        value: assortmentReport.averageMarkupPercent,
      },
    ]);
    this.styleHeader(sheet);
  }

  private addRecommendationsSheet(
    workbook: ExcelJS.Workbook,
    operationalReport: OperationalReport,
  ) {
    const sheet = workbook.addWorksheet('Recommendations');
    sheet.columns = [
      { header: 'Severity', key: 'severity', width: 14 },
      { header: 'Kind', key: 'kind', width: 20 },
      { header: 'Article', key: 'article', width: 18 },
      { header: 'Product', key: 'productName', width: 36 },
      { header: 'Metric', key: 'metricLabel', width: 18 },
      { header: 'Value', key: 'metricValue', width: 16 },
      { header: 'Action', key: 'action', width: 42 },
      { header: 'Description', key: 'description', width: 56 },
    ];
    sheet.addRows(operationalReport.recommendations);
    this.styleHeader(sheet);
  }

  private addStockRiskSheet(
    workbook: ExcelJS.Workbook,
    operationalReport: OperationalReport,
  ) {
    const sheet = workbook.addWorksheet('Stock risk');
    sheet.columns = [
      { header: 'Article', key: 'article', width: 18 },
      { header: 'Product', key: 'name', width: 36 },
      { header: 'Stock quantity', key: 'stockQuantity', width: 18 },
      { header: 'Average daily sales', key: 'averageDailySales', width: 22 },
      { header: 'Stock days', key: 'stockDays', width: 16 },
    ];
    sheet.addRows(operationalReport.outOfStockRiskProducts);
    this.styleHeader(sheet);
  }

  private addNoSalesSheet(
    workbook: ExcelJS.Workbook,
    operationalReport: OperationalReport,
  ) {
    const sheet = workbook.addWorksheet('No sales');
    sheet.columns = [
      { header: 'Article', key: 'article', width: 18 },
      { header: 'Product', key: 'name', width: 36 },
      { header: 'Category', key: 'categoryName', width: 24 },
      { header: 'Supplier', key: 'supplierName', width: 24 },
      { header: 'Stock quantity', key: 'stockQuantity', width: 18 },
    ];
    sheet.addRows(operationalReport.productsWithoutSales);
    this.styleHeader(sheet);
  }

  private addAbcSheet(
    workbook: ExcelJS.Workbook,
    skuPerformanceReport: SkuPerformanceReport,
  ) {
    const sheet = workbook.addWorksheet('ABC');
    sheet.columns = [
      { header: 'Basis', key: 'basis', width: 18 },
      { header: 'Group', key: 'group', width: 10 },
      { header: 'SKU', key: 'productsCount', width: 12 },
      {
        header: 'Assortment share, %',
        key: 'assortmentSharePercent',
        width: 22,
      },
      { header: 'Revenue share, %', key: 'revenueSharePercent', width: 20 },
      { header: 'Profit share, %', key: 'profitSharePercent', width: 18 },
    ];
    sheet.addRows([
      ...skuPerformanceReport.abcByRevenue.map((item) => ({
        basis: 'Revenue',
        ...item,
      })),
      ...skuPerformanceReport.abcByProfit.map((item) => ({
        basis: 'Profit',
        ...item,
      })),
    ]);
    this.styleHeader(sheet);
  }

  private addTopSkuSheet(
    workbook: ExcelJS.Workbook,
    skuPerformanceReport: SkuPerformanceReport,
  ) {
    const sheet = workbook.addWorksheet('Top SKU');
    sheet.columns = [
      { header: 'Article', key: 'article', width: 18 },
      { header: 'Product', key: 'name', width: 36 },
      { header: 'Category', key: 'categoryName', width: 24 },
      { header: 'Supplier', key: 'supplierName', width: 24 },
      { header: 'Quantity', key: 'soldQuantity', width: 14 },
      { header: 'Revenue', key: 'revenue', width: 16 },
      { header: 'Gross profit', key: 'grossProfit', width: 18 },
      { header: 'Margin, %', key: 'marginPercent', width: 14 },
      { header: 'Sales/facing', key: 'salesPerFacing', width: 16 },
      { header: 'Profit/facing', key: 'profitPerFacing', width: 16 },
      { header: 'ABC revenue', key: 'abcRevenueGroup', width: 14 },
      { header: 'ABC profit', key: 'abcProfitGroup', width: 14 },
    ];
    sheet.addRows(skuPerformanceReport.topByRevenue);
    this.styleHeader(sheet);
  }

  private addTopSuppliersSheet(
    workbook: ExcelJS.Workbook,
    suppliersPerformanceReport: SuppliersPerformanceReport,
  ) {
    const sheet = workbook.addWorksheet('Top suppliers');
    sheet.columns = [
      { header: 'Supplier', key: 'supplierName', width: 32 },
      { header: 'Active SKU', key: 'activeSku', width: 14 },
      { header: 'Quantity', key: 'soldQuantity', width: 14 },
      { header: 'Revenue', key: 'revenue', width: 16 },
      { header: 'Gross profit', key: 'grossProfit', width: 18 },
      { header: 'Margin, %', key: 'marginPercent', width: 14 },
      { header: 'Sales share, %', key: 'salesSharePercent', width: 18 },
      { header: 'Profit share, %', key: 'profitSharePercent', width: 18 },
      {
        header: 'Average revenue/SKU',
        key: 'averageRevenuePerSku',
        width: 22,
      },
      { header: 'Payment delay days', key: 'paymentDelayDays', width: 20 },
      { header: 'Min order amount', key: 'minOrderAmount', width: 18 },
      { header: 'Order multiplicity', key: 'orderMultiplicity', width: 20 },
    ];
    sheet.addRows(suppliersPerformanceReport.rows);
    this.styleHeader(sheet);
  }

  private addAssortmentGroupsSheet(
    workbook: ExcelJS.Workbook,
    assortmentReport: AssortmentReport,
  ) {
    const sheet = workbook.addWorksheet('Assortment groups');
    sheet.columns = [
      { header: 'Group type', key: 'groupType', width: 18 },
      { header: 'Name', key: 'name', width: 32 },
      { header: 'SKU', key: 'productsCount', width: 12 },
      { header: 'Average margin, %', key: 'averageMarginPercent', width: 20 },
      { header: 'Average sale price', key: 'averageSalePrice', width: 20 },
      { header: 'Facing', key: 'totalFacing', width: 14 },
    ];
    sheet.addRows([
      ...assortmentReport.categoryBreakdown.map((item) => ({
        groupType: 'Category',
        ...item,
      })),
      ...assortmentReport.supplierBreakdown.map((item) => ({
        groupType: 'Supplier',
        ...item,
      })),
    ]);
    this.styleHeader(sheet);
  }

  private addLowMarginSheet(
    workbook: ExcelJS.Workbook,
    assortmentReport: AssortmentReport,
  ) {
    const sheet = workbook.addWorksheet('Low margin');
    sheet.columns = [
      { header: 'Article', key: 'article', width: 18 },
      { header: 'Product', key: 'name', width: 36 },
      { header: 'Category', key: 'categoryName', width: 24 },
      { header: 'Supplier', key: 'supplierName', width: 24 },
      { header: 'Purchase price', key: 'purchasePrice', width: 18 },
      { header: 'Sale price', key: 'salePrice', width: 16 },
      { header: 'Margin, %', key: 'marginPercent', width: 14 },
    ];
    sheet.addRows(assortmentReport.lowMarginProducts);
    this.styleHeader(sheet);
  }

  private styleHeader(sheet: ExcelJS.Worksheet) {
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
}

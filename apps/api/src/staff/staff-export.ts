import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

export type StaffExportFormat = 'csv' | 'xlsx';
export type StaffExportCell = string | number | boolean | null | undefined;

export type StaffExportFile = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

type StaffExportOptions = {
  format: StaffExportFormat;
  fileNameBase: string;
  sheetName: string;
  rows: StaffExportCell[][];
  widths?: number[];
};

export function resolveStaffExportFormat(
  format: string | null | undefined,
): StaffExportFormat {
  const normalized = format?.trim().toLowerCase();

  if (!normalized || normalized === 'csv') {
    return 'csv';
  }

  if (normalized === 'xlsx') {
    return 'xlsx';
  }

  throw new BadRequestException('Export format must be csv or xlsx');
}

export async function buildStaffExportFile(
  options: StaffExportOptions,
): Promise<StaffExportFile> {
  if (options.format === 'xlsx') {
    return {
      fileName: `${options.fileNameBase}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await buildXlsx(options),
    };
  }

  return {
    fileName: `${options.fileNameBase}.csv`,
    contentType: 'text/csv; charset=utf-8',
    buffer: Buffer.from(toCsv(options.rows), 'utf8'),
  };
}

export function formatStaffDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function staffUserLabel(
  user: { email: string; fullName: string | null } | null | undefined,
) {
  if (!user) {
    return null;
  }

  return user.fullName ? `${user.fullName} (${user.email})` : user.email;
}

export function staffYesNo(value: boolean) {
  return value ? 'Да' : 'Нет';
}

function toCsv(rows: StaffExportCell[][]) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
}

function csvCell(cell: StaffExportCell) {
  const value = cell === null || cell === undefined ? '' : String(cell);
  return `"${value.replaceAll('"', '""')}"`;
}

async function buildXlsx({
  rows,
  sheetName,
  widths,
}: StaffExportOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LeetPlus';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31) || 'Export');
  const columnsCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  worksheet.columns = Array.from({ length: columnsCount }, (_, index) => ({
    key: `column_${index + 1}`,
    width: widths?.[index] ?? 22,
  }));

  rows.forEach((row, index) => {
    const excelRow = worksheet.addRow(
      row.map((cell) => (cell === null || cell === undefined ? '' : cell)),
    );

    if (index === 0) {
      excelRow.font = { bold: true };
      excelRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      };
    }
  });

  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

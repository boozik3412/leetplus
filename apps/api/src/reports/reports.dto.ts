import type { ReportExportQuery } from './reports-export.service';

export type SendReportEmailDto = ReportExportQuery & {
  recipientEmail?: string;
};

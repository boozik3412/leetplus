import type { ReportExportQuery } from './reports-export.service';
import type { RecommendationRole, RecommendationStatus } from '@prisma/client';

export type SendReportEmailDto = ReportExportQuery & {
  recipientEmail?: string;
};

export type ReportDigestType = 'DAILY' | 'WEEKLY';

export type SendReportDigestEmailDto = {
  type?: ReportDigestType;
  recipientEmail?: string;
};

export type SendScheduledReportDigestDto = {
  type?: ReportDigestType;
  dryRun?: boolean;
};

export type UpdateRecommendationStateDto = {
  status?: RecommendationStatus;
  role?: RecommendationRole;
  note?: string | null;
};

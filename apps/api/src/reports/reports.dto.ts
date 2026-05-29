import type { ReportExportQuery } from './reports-export.service';
import type { RecommendationRole, RecommendationStatus } from '@prisma/client';

export type SendReportEmailDto = ReportExportQuery & {
  recipientEmail?: string;
};

export type UpdateRecommendationStateDto = {
  status?: RecommendationStatus;
  role?: RecommendationRole;
  note?: string | null;
};

import { getApiUrl, getAuthHeaders } from "./api";

export type StaffShiftReportAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  url: string;
  createdAt: string;
};

export type StaffShiftReportDraft = {
  generatedAt: string;
  storeId: string | null;
  clubName: string;
  dateLabel: string;
  dayPartLabel: string;
  administratorName: string;
  shiftStartedAt: string | null;
  shiftStoppedAt: string | null;
  checklists: Array<{
    id: string;
    title: string;
    status: string;
    requiredItemsDone: number;
    requiredItemsTotal: number;
    evidenceDone: number;
    evidenceTotal: number;
    submittedAt: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    completedAt: string | null;
  }>;
  attachments: StaffShiftReportAttachment[];
  missingData: string[];
  body: string;
};

export type StaffShiftReportSendResult = {
  channelId: string;
  messageId: string;
  chatHref: string;
};

export async function getStaffShiftReportDraft() {
  const response = await fetch(`${getApiUrl()}/staff/shift-reports/draft`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch staff shift report draft");
  }

  return response.json() as Promise<StaffShiftReportDraft>;
}

import { getApiUrl, getAuthHeaders } from "./api";

export type StaffShiftReportAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  url: string;
  createdAt: string;
};

export type StaffShiftReportProductGroup = {
  quantity: number;
  revenue: number;
};

export type StaffShiftReportFinancials = {
  sourceWindowStartedAt: string | null;
  sourceWindowStoppedAt: string | null;
  cashAmount: number | null;
  cashlessAmount: number | null;
  mobilePay: number | null;
  yandexPay: number | null;
  refundsAmount: number | null;
  incassAmount: number | null;
  shiftCashTotal: number | null;
  productRevenue: number | null;
  productSalesCount: number;
  hookahs: StaffShiftReportProductGroup;
  devices: StaffShiftReportProductGroup;
  merch: StaffShiftReportProductGroup;
  sourceNotes: string[];
};

export type StaffShiftReportShiftOption = {
  id: string;
  externalUserId: string | null;
  operatorName: string;
  storeName: string;
  startedAt: string | null;
  stoppedAt: string | null;
  status: "OPEN" | "CLOSED";
  isSelected: boolean;
};

export type StaffShiftReportDraft = {
  generatedAt: string;
  storeId: string | null;
  selectedShiftId: string | null;
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
  shiftOptions: StaffShiftReportShiftOption[];
  syncWarnings: string[];
  financials: StaffShiftReportFinancials;
  missingData: string[];
  body: string;
};

export type StaffShiftReportSendResult = {
  channelId: string;
  messageId: string;
  chatHref: string;
};

async function readReportApiError(response: Response) {
  try {
    const data = (await response.json()) as { message?: unknown };

    if (typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }
  } catch {
    // The backend can return an empty response on infrastructure errors.
  }

  return "Не удалось сформировать черновик отчета по смене.";
}

export async function getStaffShiftReportDraft(shiftId?: string | null) {
  const url = new URL(`${getApiUrl()}/staff/shift-reports/draft`);

  if (shiftId) {
    url.searchParams.set("shiftId", shiftId);
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(await readReportApiError(response));
  }

  return response.json() as Promise<StaffShiftReportDraft>;
}

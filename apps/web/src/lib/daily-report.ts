import { getApiUrl, getAuthHeaders } from "./api";
import type { DailyReportPreview } from "./daily-report-view";

export async function getDailyReport(
  date?: string,
): Promise<DailyReportPreview> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  const query = params.toString();
  const response = await fetch(
    `${getApiUrl()}/reports/daily${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      headers: await getAuthHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch daily report");
  }

  return response.json() as Promise<DailyReportPreview>;
}

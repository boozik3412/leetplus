import { proxyFileRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyFileRequest(request, "/reports/export", "leetplus-reports.csv");
}

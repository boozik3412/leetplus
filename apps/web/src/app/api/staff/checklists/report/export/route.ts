import { proxyFileRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyFileRequest(
    request,
    "/staff/checklists/report/export",
    "leetplus-staff-checklists.csv",
  );
}

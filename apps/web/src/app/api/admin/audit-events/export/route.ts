import { proxyFileRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyFileRequest(
    request,
    "/admin/audit-events/export",
    "leetplus-platform-audit.csv",
  );
}

import { proxyFileRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyFileRequest(
    request,
    "/staff/discipline/export",
    "leetplus-staff-violations.csv",
  );
}

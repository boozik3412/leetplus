import { proxyFileRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyFileRequest(
    request,
    "/staff/training-profiles/export",
    "leetplus-staff-training-results.csv",
  );
}

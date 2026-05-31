import { proxyFileRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyFileRequest(
    request,
    "/staff/tasks/export",
    "leetplus-staff-tasks.csv",
  );
}

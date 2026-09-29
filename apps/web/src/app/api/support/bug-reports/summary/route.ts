import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyJsonRequest(request, "/support/bug-reports/summary", "GET", {
    forwardQuery: false,
    privateNoStore: true,
  });
}

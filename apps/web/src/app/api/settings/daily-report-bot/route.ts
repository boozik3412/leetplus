import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyJsonRequest(request, "/settings/daily-report-bot", "GET", {
    forwardQuery: false,
    privateNoStore: true,
  });
}

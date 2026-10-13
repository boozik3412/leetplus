import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyJsonRequest(request, "/staff/notifications/summary", "GET", {
    forwardQuery: false,
    privateNoStore: true,
  });
}

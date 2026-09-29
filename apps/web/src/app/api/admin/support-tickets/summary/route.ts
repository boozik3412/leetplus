import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyJsonRequest(request, "/admin/support-tickets/summary", "GET", {
    forwardQuery: false,
    privateNoStore: true,
  });
}

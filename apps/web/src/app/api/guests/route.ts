import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyJsonRequest(request, "/guests", "GET");
}

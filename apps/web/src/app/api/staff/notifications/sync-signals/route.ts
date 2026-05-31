import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(request: Request) {
  return proxyJsonRequest(request, "/staff/notifications/sync-signals", "POST");
}

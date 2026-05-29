import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(request: Request) {
  return proxyJsonRequest(request, "/reports/digests/email", "POST");
}

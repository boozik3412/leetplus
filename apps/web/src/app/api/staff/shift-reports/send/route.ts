import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(request: Request) {
  return proxyJsonRequest(request, "/staff/shift-reports/send", "POST");
}

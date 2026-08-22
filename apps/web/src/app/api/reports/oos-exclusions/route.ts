import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyJsonRequest(request, "/reports/oos-exclusions", "GET", {
    privateNoStore: true,
  });
}

export async function POST(request: Request) {
  return proxyJsonRequest(request, "/reports/oos-exclusions", "POST", {
    privateNoStore: true,
  });
}

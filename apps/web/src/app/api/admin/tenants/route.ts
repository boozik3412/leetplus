import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(request: Request) {
  return proxyJsonRequest(request, "/admin/tenants", "POST", {
    privateNoStore: true,
  });
}

import { proxyJsonRequest } from "@/lib/proxy";

export async function PATCH(request: Request) {
  return proxyJsonRequest(request, "/products/bulk-category", "PATCH");
}

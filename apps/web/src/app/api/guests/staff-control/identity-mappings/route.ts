import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(request: Request) {
  return proxyJsonRequest(
    request,
    "/guests/staff-control/identity-mappings",
    "POST",
  );
}

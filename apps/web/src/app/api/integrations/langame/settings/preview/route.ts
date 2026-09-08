import { proxyJsonRequest } from "@/lib/proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyJsonRequest(
    request,
    "/integrations/langame/settings/preview",
    "POST",
    { forwardQuery: false, privateNoStore: true },
  );
}

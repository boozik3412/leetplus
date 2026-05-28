import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(request: Request) {
  return proxyJsonRequest(
    request,
    "/marketing/promo-bundle-usages/import",
    "POST",
  );
}

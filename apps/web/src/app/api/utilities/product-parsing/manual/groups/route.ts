import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(request: Request) {
  return proxyJsonRequest(
    request,
    "/utilities/product-parsing/manual/groups",
    "POST",
  );
}

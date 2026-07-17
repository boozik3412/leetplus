import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(request: Request) {
  return proxyJsonRequest(request, "/products", "GET");
}

export async function POST(request: Request) {
  return proxyJsonRequest(request, "/products", "POST");
}

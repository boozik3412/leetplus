import { proxyJsonRequest } from "@/lib/proxy";

const USERS_BFF_OPTIONS = {
  forwardQuery: false,
  privateNoStore: true,
} as const;

export async function GET(request: Request) {
  return proxyJsonRequest(request, "/users", "GET", USERS_BFF_OPTIONS);
}

export async function POST(request: Request) {
  return proxyJsonRequest(request, "/users", "POST", USERS_BFF_OPTIONS);
}

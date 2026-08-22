import { proxyJsonRequest } from "@/lib/proxy";

const USERS_BFF_OPTIONS = {
  forwardQuery: false,
  privateNoStore: true,
} as const;

export async function POST(request: Request) {
  return proxyJsonRequest(request, "/users/roles", "POST", USERS_BFF_OPTIONS);
}

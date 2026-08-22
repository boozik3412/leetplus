import { proxyJsonRequest } from "@/lib/proxy";

const USERS_BFF_OPTIONS = {
  forwardQuery: false,
  privateNoStore: true,
} as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ role: string }> },
) {
  const { role } = await params;

  return proxyJsonRequest(
    request,
    `/users/system-roles/${encodeURIComponent(role)}`,
    "PATCH",
    USERS_BFF_OPTIONS,
  );
}

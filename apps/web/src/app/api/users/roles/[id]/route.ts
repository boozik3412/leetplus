import { proxyJsonRequest } from "@/lib/proxy";

const USERS_BFF_OPTIONS = {
  forwardQuery: false,
  privateNoStore: true,
} as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyJsonRequest(
    request,
    `/users/roles/${encodeURIComponent(id)}`,
    "PATCH",
    USERS_BFF_OPTIONS,
  );
}

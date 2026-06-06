import { proxyJsonRequest } from "@/lib/proxy";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ role: string }> },
) {
  const { role } = await params;

  return proxyJsonRequest(
    request,
    `/users/system-roles/${encodeURIComponent(role)}`,
    "PATCH",
  );
}

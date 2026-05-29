import { proxyJsonRequest } from "@/lib/proxy";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyJsonRequest(
    request,
    `/staff/shift-regulations/${encodeURIComponent(id)}`,
    "PATCH",
  );
}

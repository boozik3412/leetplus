import { proxyJsonRequest } from "@/lib/proxy";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyJsonRequest(
    request,
    `/marketing/promo-scenario-rewards/${encodeURIComponent(id)}`,
    "PATCH",
  );
}

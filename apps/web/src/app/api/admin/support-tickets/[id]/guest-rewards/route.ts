import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyJsonRequest(
    request,
    `/admin/support-tickets/${encodeURIComponent(id)}/guest-rewards`,
    "GET",
    { forwardQuery: false, privateNoStore: true },
  );
}

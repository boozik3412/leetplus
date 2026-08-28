import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyJsonRequest(
    request,
    `/admin/support-tickets/${encodeURIComponent(id)}/comments`,
    "POST",
    { forwardQuery: false, privateNoStore: true },
  );
}

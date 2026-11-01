import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyJsonRequest(
    request,
    `/admin/tenants/${encodeURIComponent(id)}/stores`,
    "GET",
    { forwardQuery: false, privateNoStore: true },
  );
}

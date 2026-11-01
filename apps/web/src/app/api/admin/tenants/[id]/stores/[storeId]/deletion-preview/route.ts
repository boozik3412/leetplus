import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; storeId: string }> },
) {
  const { id, storeId } = await params;

  return proxyJsonRequest(
    request,
    `/admin/tenants/${encodeURIComponent(id)}/stores/${encodeURIComponent(storeId)}/deletion-preview`,
    "GET",
    { forwardQuery: false, privateNoStore: true },
  );
}

import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; storeId: string }> },
) {
  const { id, storeId } = await params;

  return proxyJsonRequest(
    request,
    `/admin/tenants/${encodeURIComponent(id)}/stores/${encodeURIComponent(storeId)}/delete`,
    "POST",
  );
}

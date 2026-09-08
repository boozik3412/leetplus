import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyJsonRequest(
    request,
    `/admin/tenants/${encodeURIComponent(id)}/initial-owner-invite/publish-link`,
    "POST",
    { privateNoStore: true },
  );
}

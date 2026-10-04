import { proxyJsonRequest } from "@/lib/proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyJsonRequest(
    request,
    `/support/bug-reports/${encodeURIComponent(id)}/guest-rewards`,
    "GET",
    { forwardQuery: false, privateNoStore: true },
  );
}

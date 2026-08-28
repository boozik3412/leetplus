import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyJsonRequest(
    request,
    `/support/bug-reports/${encodeURIComponent(id)}/comments`,
    "POST",
    { forwardQuery: false, privateNoStore: true },
  );
}

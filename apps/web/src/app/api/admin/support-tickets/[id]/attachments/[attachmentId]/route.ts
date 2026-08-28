import { proxyFileRequest } from "@/lib/proxy";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; attachmentId: string }>;
  },
) {
  const { id, attachmentId } = await params;
  return proxyFileRequest(
    request,
    `/admin/support-tickets/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
    "bug-report-attachment",
    { forwardQuery: false },
  );
}

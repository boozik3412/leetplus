import { proxyJsonRequest } from "@/lib/proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;

  return proxyJsonRequest(
    request,
    `/staff/checklists/${id}/items/${itemId}/review-messages`,
    "POST",
  );
}

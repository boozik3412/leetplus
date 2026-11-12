import { proxyJsonRequest } from "@/lib/proxy";

type RouteContext = {
  params: Promise<{
    id: string;
    ticketId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id, ticketId } = await context.params;
  return proxyJsonRequest(
    request,
    `/stores/${encodeURIComponent(id)}/floor-plan/live/alerts/${encodeURIComponent(ticketId)}`,
    "POST",
    { forwardQuery: false, privateNoStore: true },
  );
}

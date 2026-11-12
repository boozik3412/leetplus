import { proxyJsonRequest } from "@/lib/proxy";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyJsonRequest(
    request,
    `/stores/${encodeURIComponent(id)}/floor-plan/live/attention`,
    "GET",
    { forwardQuery: false, privateNoStore: true },
  );
}

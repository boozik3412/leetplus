import { proxyJsonRequest } from "@/lib/proxy";

type RouteContext = {
  params: Promise<{
    id: string;
    number: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id, number } = await context.params;
  return proxyJsonRequest(
    request,
    `/stores/${encodeURIComponent(id)}/floor-plan/live/seats/${encodeURIComponent(number)}`,
    "GET",
    { forwardQuery: false, privateNoStore: true },
  );
}

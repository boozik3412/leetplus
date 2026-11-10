import { proxyJsonRequest } from "@/lib/proxy";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const OPTIONS = { forwardQuery: false, privateNoStore: true } as const;

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyJsonRequest(
    request,
    `/stores/${encodeURIComponent(id)}/floor-plan`,
    "GET",
    OPTIONS,
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyJsonRequest(
    request,
    `/stores/${encodeURIComponent(id)}/floor-plan`,
    "PATCH",
    OPTIONS,
  );
}

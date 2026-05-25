import { proxyJsonRequest } from "@/lib/proxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  return proxyJsonRequest(
    request,
    `/guests/audiences/${encodeURIComponent(id)}/tasks`,
    "POST",
  );
}

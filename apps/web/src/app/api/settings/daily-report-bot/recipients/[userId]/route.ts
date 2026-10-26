import { proxyJsonRequest } from "@/lib/proxy";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { userId } = await context.params;
  return proxyJsonRequest(
    request,
    `/settings/daily-report-bot/recipients/${encodeURIComponent(userId)}`,
    "PATCH",
    { forwardQuery: false, privateNoStore: true },
  );
}

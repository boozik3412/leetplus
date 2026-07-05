import { proxyJsonRequest } from "@/lib/proxy";

type RouteContext = {
  params: Promise<{ id: string; userId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id, userId } = await context.params;

  return proxyJsonRequest(
    request,
    `/staff/salary/periods/${encodeURIComponent(id)}/rows/${encodeURIComponent(userId)}`,
    "PATCH",
  );
}

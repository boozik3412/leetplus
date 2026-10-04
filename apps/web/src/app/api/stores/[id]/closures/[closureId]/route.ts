import { proxyJsonRequest } from "@/lib/proxy";

type RouteContext = {
  params: Promise<{
    id: string;
    closureId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id, closureId } = await context.params;
  return proxyJsonRequest(
    request,
    `/stores/${encodeURIComponent(id)}/closures/${encodeURIComponent(closureId)}`,
    "PATCH",
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id, closureId } = await context.params;
  return proxyJsonRequest(
    request,
    `/stores/${encodeURIComponent(id)}/closures/${encodeURIComponent(closureId)}`,
    "DELETE",
  );
}

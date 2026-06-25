import { proxyJsonRequest } from "@/lib/proxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  return proxyJsonRequest(
    request,
    `/users/invites/${encodeURIComponent(id)}`,
    "PATCH",
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;

  return proxyJsonRequest(
    request,
    `/users/invites/${encodeURIComponent(id)}`,
    "DELETE",
  );
}

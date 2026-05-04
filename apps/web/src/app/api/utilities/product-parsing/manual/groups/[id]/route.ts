import { proxyJsonRequest } from "@/lib/proxy";

type Params = Promise<{ id: string }>;

export async function PATCH(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  return proxyJsonRequest(
    request,
    `/utilities/product-parsing/manual/groups/${id}`,
    "PATCH",
  );
}

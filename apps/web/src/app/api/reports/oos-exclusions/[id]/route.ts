import { proxyJsonRequest } from "@/lib/proxy";

type Params = Promise<{ id: string }>;

export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  return proxyJsonRequest(request, `/reports/oos-exclusions/${id}`, "DELETE");
}

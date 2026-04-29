import { proxyJsonRequest } from "@/lib/proxy";

type Params = Promise<{ id: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  return proxyJsonRequest(
    request,
    `/utilities/product-parsing/suggestions/${id}/reject`,
    "POST",
  );
}

import { proxyJsonRequest } from "@/lib/proxy";

type Params = Promise<{ key: string }>;

export async function PATCH(request: Request, { params }: { params: Params }) {
  const { key } = await params;

  return proxyJsonRequest(
    request,
    `/reports/recommendations/${encodeURIComponent(key)}/state`,
    "PATCH",
  );
}

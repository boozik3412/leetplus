import { proxyJsonRequest } from "@/lib/proxy";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyJsonRequest(
    request,
    `/guests/staff-control/identity-mappings/${id}`,
    "DELETE",
  );
}

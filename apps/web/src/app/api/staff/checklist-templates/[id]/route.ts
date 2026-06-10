import { proxyJsonRequest } from "@/lib/proxy";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyJsonRequest(
    request,
    `/staff/checklist-templates/${encodeURIComponent(id)}`,
    "PATCH",
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return proxyJsonRequest(
    request,
    `/staff/checklist-templates/${encodeURIComponent(id)}`,
    "DELETE",
  );
}

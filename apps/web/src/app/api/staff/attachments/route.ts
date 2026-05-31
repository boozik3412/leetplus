import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Файл не выбран" }, { status: 400 });
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { message: "Файл должен быть не больше 5 МБ" },
      { status: 400 },
    );
  }

  const upstreamFormData = new FormData();
  upstreamFormData.set("file", file, file.name);

  const response = await fetch(`${getApiUrl()}/staff/attachments`, {
    method: "POST",
    headers,
    body: upstreamFormData,
  });

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  const data = (await response.json()) as { id: string };
  const url = new URL(
    `/api/staff/attachments/${encodeURIComponent(data.id)}`,
    request.url,
  ).toString();

  return NextResponse.json({ ...data, url });
}

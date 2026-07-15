import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";

const MAX_MEDIA_BYTES = 2 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json(
      { message: "Разрешены только JPG, PNG и WebP" },
      { status: 400 },
    );
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json(
      { message: "Изображение должно быть не больше 2 МБ" },
      { status: 400 },
    );
  }

  const upstream = new FormData();
  upstream.set("file", file, file.name);
  const response = await fetch(`${getApiUrl()}/guests/gamification/media`, {
    method: "POST",
    headers,
    body: upstream,
  });
  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  const data = (await response.json()) as { id: string };
  return NextResponse.json({
    ...data,
    url: `/api/guest-game/media/${encodeURIComponent(data.id)}`,
  });
}

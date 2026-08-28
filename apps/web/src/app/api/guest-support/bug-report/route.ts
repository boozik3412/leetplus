import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getApiUrl, readApiError } from "@/lib/api";
import { GUEST_AUTH_COOKIE_NAME } from "@/lib/guest-portal";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 32 * 1024;
const allowedFields = [
  "topic",
  "description",
  "route",
  "viewport",
  "timeZone",
] as const;

export async function POST(request: Request) {
  const rawContentLength = request.headers.get("content-length")?.trim() ?? "";
  const contentLength = /^\d+$/.test(rawContentLength)
    ? Number.parseInt(rawContentLength, 10)
    : Number.NaN;
  if (
    !Number.isFinite(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_REQUEST_BYTES
  ) {
    return privateJson(
      { message: "Размер обращения превышает допустимый лимит." },
      413,
    );
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_AUTH_COOKIE_NAME)?.value ?? null;
  if (!token) {
    return privateJson(
      { message: "Гостевая сессия не найдена" },
      401,
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(idempotencyKey)) {
    return privateJson(
      { message: "Некорректный ключ отправки обращения." },
      400,
    );
  }

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return privateJson(
      { message: "Не удалось прочитать данные обращения." },
      400,
    );
  }

  const supportedKeys = new Set<string>([...allowedFields, "file"]);
  for (const key of incoming.keys()) {
    if (!supportedKeys.has(key) || incoming.getAll(key).length !== 1) {
      return privateJson(
        { message: "Обращение содержит недопустимые поля." },
        400,
      );
    }
  }

  const projected = new FormData();
  for (const key of allowedFields) {
    const value = incoming.get(key);
    if (typeof value === "string") {
      projected.set(key, value);
    }
  }

  const file = incoming.get("file");
  if (file !== null && !(file instanceof File)) {
    return privateJson(
      { message: "Вложение должно быть изображением." },
      400,
    );
  }
  if (file instanceof File && file.size > 0) {
    if (
      file.size > MAX_IMAGE_BYTES ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      return privateJson(
        { message: "Разрешён один файл JPG, PNG или WebP размером до 5 МБ." },
        400,
      );
    }
    projected.set("file", file, file.name);
  }

  const response = await fetch(
    `${getApiUrl()}/guest-portal/session/support/bug-reports`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": idempotencyKey,
        "X-Client-User-Agent": request.headers.get("user-agent") ?? "",
      },
      body: projected,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return privateJson(
      { message: await readApiError(response) },
      response.status,
    );
  }

  const data = (await response.json()) as {
    ticketNumber?: unknown;
    createdAt?: unknown;
  };
  if (
    typeof data.ticketNumber !== "string" ||
    typeof data.createdAt !== "string"
  ) {
    return privateJson(
      { message: "Сервис обращений вернул некорректный ответ." },
      502,
    );
  }

  return privateJson(
    {
      ticketNumber: data.ticketNumber,
      createdAt: data.createdAt,
    },
    200,
  );
}

function privateJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

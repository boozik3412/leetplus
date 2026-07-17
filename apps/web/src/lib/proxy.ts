import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders } from "./api";

export async function proxyJsonRequest(
  request: Request,
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  const body =
    method === "GET" || method === "DELETE" ? undefined : await request.text();
  const url = new URL(request.url);
  const response = await fetch(`${getApiUrl()}${path}${url.search}`, {
    method,
    cache: "no-store",
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });

  if (!response.ok) {
    return NextResponse.json(await readProxyErrorBody(response), {
      status: response.status,
    });
  }

  return NextResponse.json(await response.json());
}

async function readProxyErrorBody(response: Response) {
  const rawError = await response.text();

  try {
    return JSON.parse(rawError) as unknown;
  } catch {
    return { message: rawError || "Ошибка запроса" };
  }
}

export async function proxyFileRequest(
  request: Request,
  path: string,
  fallbackFileName: string,
) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "РќРµРѕР±С…РѕРґРёРјРѕ РІРѕР№С‚Рё РІ Р°РєРєР°СѓРЅС‚" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const response = await fetch(`${getApiUrl()}${path}${url.search}`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const rawError = await response.text();
    let errorBody: unknown;

    try {
      errorBody = JSON.parse(rawError);
    } catch {
      errorBody = { message: rawError || "Ошибка запроса" };
    }

    return NextResponse.json(errorBody, { status: response.status });
  }

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition":
        response.headers.get("content-disposition") ??
        `attachment; filename="${fallbackFileName}"`,
    },
  });
}

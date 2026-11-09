import type { ApiRequestErrorBody } from "./types";

export class ApiRequestError extends Error {
  status: number;
  body: ApiRequestErrorBody | null;

  constructor(status: number, body: ApiRequestErrorBody | null) {
    super(body?.message ?? "Ошибка запроса");
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });

  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ApiRequestErrorBody | null;
    throw new ApiRequestError(response.status, body);
  }

  return response.json() as Promise<T>;
}

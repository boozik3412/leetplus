type ApiUrlEnvironment = Readonly<Record<string, string | undefined>>;

function normalizeApiOrigin(value: string, key: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be an absolute HTTP(S) origin`);
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${key} must be an absolute HTTP(S) origin`);
  }

  return url.origin;
}

export function resolveApiUrl(environment: ApiUrlEnvironment) {
  const serverApiUrl = environment.API_URL?.trim();
  if (serverApiUrl) {
    return normalizeApiOrigin(serverApiUrl, "API_URL");
  }

  if (environment.NODE_ENV === "production") {
    throw new Error("API_URL is required in production");
  }

  const developmentApiUrl = environment.NEXT_PUBLIC_API_URL?.trim();
  if (!developmentApiUrl) {
    throw new Error("API_URL or NEXT_PUBLIC_API_URL is required");
  }

  return normalizeApiOrigin(developmentApiUrl, "NEXT_PUBLIC_API_URL");
}

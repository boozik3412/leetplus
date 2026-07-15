import { getApiUrl } from "@/lib/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const response = await fetch(
    `${getApiUrl()}/public/guest-game/media/${encodeURIComponent(id)}`,
    { cache: "force-cache" },
  );

  if (!response.ok) {
    return new Response(null, { status: response.status });
  }

  const headers = new Headers({
    "Content-Type": response.headers.get("content-type") ?? "image/webp",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  const contentLength = response.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(await response.arrayBuffer(), { headers });
}

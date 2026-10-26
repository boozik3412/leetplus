import { proxyJsonRequest } from "@/lib/proxy";

// The bot token only passes through to the API, which stores it encrypted.
export async function POST(request: Request) {
  return proxyJsonRequest(request, "/settings/daily-report-bot/token", "POST", {
    forwardQuery: false,
    privateNoStore: true,
  });
}

export async function DELETE(request: Request) {
  return proxyJsonRequest(
    request,
    "/settings/daily-report-bot/token",
    "DELETE",
    { forwardQuery: false, privateNoStore: true },
  );
}

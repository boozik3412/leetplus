import { NextResponse } from "next/server";
import { proxyJsonRequest } from "@/lib/proxy";

type RouteContext = {
  params: Promise<{
    action: string;
  }>;
};

const actionPaths = {
  preview: "/categories/langame/preview",
  apply: "/categories/langame/apply",
  refresh: "/categories/langame/refresh",
} as const;

export async function POST(request: Request, context: RouteContext) {
  const { action } = await context.params;
  const path = actionPaths[action as keyof typeof actionPaths];

  if (!path) {
    return NextResponse.json({ message: "Неизвестное действие" }, { status: 404 });
  }

  return proxyJsonRequest(request, path, "POST");
}

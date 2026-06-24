import { NextResponse } from "next/server";
import type { ApiErrorResponse } from "@/lib/api";

export async function POST() {
  return NextResponse.json<ApiErrorResponse>(
    {
      message:
        "Самостоятельная регистрация временно отключена. Получите приглашение от администратора.",
    },
    { status: 403 },
  );
}

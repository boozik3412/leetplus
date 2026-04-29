import { NextResponse } from "next/server";
import { getApiUrl, getAuthHeaders, readApiError } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const headers = await getAuthHeaders();

  if (!headers.Authorization) {
    return NextResponse.json(
      { message: "Необходимо войти в аккаунт" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const response = await fetch(
    `${getApiUrl()}/integrations/langame/sync-jobs/${id}/discrepancy-log`,
    {
      headers,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: await readApiError(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json(), {
    headers: {
      "Content-Disposition": `attachment; filename="langame-discrepancies-${id}.json"`,
    },
  });
}

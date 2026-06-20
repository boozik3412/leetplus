import { redirect } from "next/navigation";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const targetPath = "/staff/staff-control/diagnostics";

function buildQueryString(params: Awaited<SearchParams>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value) {
      query.set(key, value);
    }
  }

  return query.toString();
}

export default async function LegacyStaffControlRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const queryString = buildQueryString(await searchParams);
  redirect(`${targetPath}${queryString ? `?${queryString}` : ""}`);
}

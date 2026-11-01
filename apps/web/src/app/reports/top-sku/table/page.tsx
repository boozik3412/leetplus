import { redirect } from "next/navigation";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// «ТОП SKU по выручке» is part of the SKU rating with ABC now.
export default async function TopSkuTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  (["from", "to", "storeId"] as const).forEach((key) => {
    const value = params[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) next.set(key, first);
  });
  const query = next.toString();
  redirect(`/reports/abc/table${query ? `?${query}` : ""}`);
}

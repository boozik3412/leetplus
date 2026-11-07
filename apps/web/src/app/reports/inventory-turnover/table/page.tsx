import { redirect } from "next/navigation";

import { stockValueHref } from "@/lib/order-planning-views";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// «Оборачиваемость и медленные SKU» is part of «Деньги в остатке» now.
export default async function InventoryTurnoverTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const view =
    params.excess === "true" ? "excess" : params.noSalesDays ? "frozen" : "all";
  redirect(stockValueHref(view, params));
}

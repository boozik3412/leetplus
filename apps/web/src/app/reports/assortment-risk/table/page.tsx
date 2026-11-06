import { redirect } from "next/navigation";

import { stockValueHref } from "@/lib/order-planning-views";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// «Деньги в риске» is part of «Деньги в остатке» now: frozen stock is the
// «Без продаж» view, profit lost to out-of-stock is «Нет в наличии».
export default async function AssortmentRiskTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  redirect(stockValueHref("frozen", await searchParams));
}

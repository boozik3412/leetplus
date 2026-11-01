import { redirect } from "next/navigation";

import { orderPlanningHref } from "@/lib/order-planning-views";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// «Товары без продаж» is the «Без движения» view of «Заказ товаров» now.
export default async function NoSalesTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  redirect(orderPlanningHref("no-movement", await searchParams));
}

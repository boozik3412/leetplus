import { redirect } from "next/navigation";

import { orderPlanningHref } from "@/lib/order-planning-views";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// «Остатки и потребность» is the «Заказ» view of «Заказ товаров» now.
export default async function ReplenishmentTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  redirect(orderPlanningHref("order", await searchParams));
}

import { redirect } from "next/navigation";

import { orderPlanningHref } from "@/lib/order-planning-views";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// «Риск out-of-stock» is the «Кончится за 3 дня» view of «Заказ товаров» now.
export default async function OosTablePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  redirect(orderPlanningHref("running-out", await searchParams));
}

import type { ProductAssortmentRole } from "@/lib/products";

export const productAssortmentRoleLabels: Record<
  ProductAssortmentRole,
  string
> = {
  CORE: "Ядро",
  TRAFFIC_DRIVER: "Трафик",
  MARGIN_DRIVER: "Маржа",
  IMPULSE: "Импульс",
  SEASONAL: "Сезон",
  TEST: "Тест",
  SERVICE: "Услуга",
  OPTIONAL: "Опция",
  EXCLUDED: "Исключен",
};

export const productAssortmentRoleOptions = Object.entries(
  productAssortmentRoleLabels,
).map(([value, label]) => ({ value, label }));

export function productAssortmentRoleLabel(role: ProductAssortmentRole) {
  return productAssortmentRoleLabels[role];
}

export type ImportTemplateKind =
  | "products"
  | "inventory"
  | "sales"
  | "movements";

type ImportTemplate = {
  fileName: string;
  csv: string;
};

const templates: Record<ImportTemplateKind, ImportTemplate> = {
  products: {
    fileName: "leetplus-products-template.csv",
    csv: [
      "Артикул,Наименование,Категория,Поставщик,Входящая цена,Цена продажи,Фейсинг,Срок годности",
      "DRK-001,Adrenaline Rush 0.449,Энергетики,Напитки Pro,62,139,4,180",
      "SNK-001,Lay's Сметана и зелень 140 г,Чипсы,Snack Line,81,179,3,100",
      "COF-002,Капучино 250 мл,Горячие напитки,Internal Bar,26,139,1,365",
    ].join("\n"),
  },
  inventory: {
    fileName: "leetplus-inventory-template.csv",
    csv: [
      "Дата,Торговая точка,Артикул,Остаток",
      "2026-04-28,LeetPlus Arena Центр,DRK-001,24",
      "2026-04-28,LeetPlus Arena Центр,SNK-001,16",
      "2026-04-28,LeetPlus Arena Север,COF-002,8",
    ].join("\n"),
  },
  sales: {
    fileName: "leetplus-sales-template.csv",
    csv: [
      "Дата,Торговая точка,Чек,Артикул,Количество,Выручка,Себестоимость",
      "2026-04-28,LeetPlus Arena Центр,CHK-1001,DRK-001,2,278,124",
      "2026-04-28,LeetPlus Arena Центр,CHK-1001,SNK-001,1,179,81",
      "2026-04-28,LeetPlus Arena Север,CHK-2057,COF-002,2,278,52",
    ].join("\n"),
  },
  movements: {
    fileName: "leetplus-stock-movements-template.csv",
    csv: [
      "Дата,Торговая точка,Артикул,Тип,Количество,Сумма,Причина",
      "2026-04-28,LeetPlus Arena Центр,FST-001,списание,2,224,Истёк срок годности",
      "2026-04-28,LeetPlus Arena Центр,DRK-001,списание,1,62,Повреждение упаковки",
      "2026-04-28,LeetPlus Arena Север,SNK-001,возврат,1,179,Возврат гостя",
    ].join("\n"),
  },
};

export function getImportTemplate(kind: ImportTemplateKind) {
  return templates[kind];
}

export function buildCsvDownloadHref(csv: string) {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${csv}`)}`;
}

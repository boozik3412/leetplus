"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";

type FactImportError = {
  row: number;
  field: string;
  message: string;
};

type FactImportRow = {
  row: number;
  date: string;
  storeName: string;
  article: string;
  productName: string;
  quantity: string;
  revenue?: string;
  cost?: string;
  type?: "WRITEOFF" | "RETURN";
  amount?: string;
  reason?: string | null;
};

type FactImportPreview = {
  totalRows: number;
  validRows: number;
  errors: FactImportError[];
  rows: FactImportRow[];
};

type FactImportResult = {
  importedRows: number;
  preview: FactImportPreview;
};

type FactImportKind = "inventory" | "sales" | "movements";

const copy: Record<
  FactImportKind,
  {
    title: string;
    description: string;
    columns: string;
    previewUrl: string;
    importUrl: string;
  }
> = {
  inventory: {
    title: "CSV остатков",
    description:
      "Загрузите дневные остатки по торговым точкам и артикулам. Точки и товары должны уже существовать.",
    columns: "Дата, Торговая точка, Артикул, Остаток",
    previewUrl: "/api/imports/inventory/preview",
    importUrl: "/api/imports/inventory",
  },
  sales: {
    title: "CSV продаж",
    description:
      "Загрузите дневные продажи по торговым точкам и артикулам. Себестоимость можно передать колонкой или рассчитать от закупочной цены товара.",
    columns: "Дата, Торговая точка, Артикул, Количество, Выручка, Себестоимость",
    previewUrl: "/api/imports/sales/preview",
    importUrl: "/api/imports/sales",
  },
  movements: {
    title: "CSV списаний и возвратов",
    description:
      "Загрузите дневные списания и возвраты по SKU. Сумму можно передать колонкой или рассчитать от цены товара.",
    columns:
      "Дата, Торговая точка, Артикул, Тип, Количество, Сумма, Причина",
    previewUrl: "/api/imports/movements/preview",
    importUrl: "/api/imports/movements",
  },
};

function getErrorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return "Не удалось выполнить импорт";
}

export function FactCsvImport({ kind }: { kind: FactImportKind }) {
  const router = useRouter();
  const config = copy[kind];
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<FactImportPreview | null>(null);
  const [result, setResult] = useState<FactImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setError(null);
    setPreview(null);
    setResult(null);

    if (!file) {
      setCsv("");
      setFileName(null);
      return;
    }

    setFileName(file.name);
    setCsv(await file.text());
  }

  async function handlePreview() {
    await submit(config.previewUrl, (data) => {
      setPreview(data as FactImportPreview);
      setResult(null);
    });
  }

  async function handleImport() {
    await submit(config.importUrl, (data) => {
      setResult(data as FactImportResult);
      router.refresh();
    });
  }

  async function submit(url: string, onSuccess: (data: unknown) => void) {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ csv, sourceFileName: fileName }),
      });

      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(getErrorMessage(data));
        return;
      }

      onSuccess(data);
    } catch {
      setError("API недоступен");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canImport = preview && preview.errors.length === 0 && preview.validRows > 0;

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">{config.title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          {config.description}
        </p>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-zinc-700">Файл CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="mt-2 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
          />
        </label>

        {fileName ? (
          <p className="mt-3 text-sm text-zinc-500">Выбран файл: {fileName}</p>
        ) : null}

        <div className="mt-5 rounded-md bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
          <p className="font-medium text-zinc-800">Поддерживаемые колонки:</p>
          <p>{config.columns}</p>
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handlePreview}
            disabled={!csv || isSubmitting}
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {isSubmitting ? "Проверка..." : "Проверить"}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport || isSubmitting}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            Импортировать
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold">Предпросмотр</h2>
        </div>

        {preview ? (
          <div className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Строк" value={preview.totalRows} />
              <Metric label="Готово к импорту" value={preview.validRows} />
              <Metric label="Ошибок" value={preview.errors.length} />
            </div>

            {result ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Импортировано строк: {result.importedRows}
              </p>
            ) : null}

            {preview.errors.length > 0 ? (
              <ul className="divide-y divide-red-100 rounded-md border border-red-100">
                {preview.errors.map((item, index) => (
                  <li
                    key={`${item.row}-${item.field}-${index}`}
                    className="px-3 py-2 text-sm text-red-700"
                  >
                    Строка {item.row}, поле {item.field}: {item.message}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Дата</th>
                    <th className="px-3 py-2 font-medium">Точка</th>
                    <th className="px-3 py-2 font-medium">Артикул</th>
                    <th className="px-3 py-2 font-medium">Товар</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Количество
                    </th>
                    {kind === "sales" ? (
                      <th className="px-3 py-2 text-right font-medium">
                        Выручка
                      </th>
                    ) : null}
                    {kind === "movements" ? (
                      <>
                        <th className="px-3 py-2 font-medium">Тип</th>
                        <th className="px-3 py-2 text-right font-medium">
                          Сумма
                        </th>
                        <th className="px-3 py-2 font-medium">Причина</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {preview.rows.slice(0, 20).map((row) => (
                    <tr key={`${row.row}-${row.article}-${row.storeName}`}>
                      <td className="px-3 py-2 text-zinc-500">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">
                        {row.storeName}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.article}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {row.productName}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-700">
                        {row.quantity}
                      </td>
                      {kind === "sales" ? (
                        <td className="px-3 py-2 text-right text-zinc-700">
                          {row.revenue}
                        </td>
                      ) : null}
                      {kind === "movements" ? (
                        <>
                          <td className="px-3 py-2 text-zinc-700">
                            {formatMovementType(row.type)}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-700">
                            {row.amount}
                          </td>
                          <td className="px-3 py-2 text-zinc-700">
                            {row.reason ?? "—"}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="p-5 text-sm text-zinc-500">
            Выберите CSV и нажмите “Проверить”, чтобы увидеть ошибки до импорта.
          </p>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
  }).format(new Date(value));
}

function formatMovementType(value: FactImportRow["type"]) {
  const labels: Record<NonNullable<FactImportRow["type"]>, string> = {
    WRITEOFF: "Списание",
    RETURN: "Возврат",
  };

  return value ? labels[value] : "—";
}

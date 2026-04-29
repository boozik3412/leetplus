"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildCsvDownloadHref,
  getImportTemplate,
} from "@/lib/import-templates";

type ProductImportError = {
  row: number;
  field: string;
  message: string;
};

type ProductImportRow = {
  row: number;
  article: string;
  name: string;
  purchasePrice: string;
  salePrice: string;
  facing: number;
  shelfLifeDays: number | null;
  categoryName: string | null;
  supplierName: string | null;
};

type ProductImportPreview = {
  totalRows: number;
  validRows: number;
  errors: ProductImportError[];
  rows: ProductImportRow[];
};

type ProductImportResult = {
  importedRows: number;
  preview: ProductImportPreview;
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

export function ProductCsvImport() {
  const router = useRouter();
  const template = getImportTemplate("products");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [result, setResult] = useState<ProductImportResult | null>(null);
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
    await submit("/api/imports/products/preview", (data) => {
      setPreview(data as ProductImportPreview);
      setResult(null);
    });
  }

  async function handleImport() {
    await submit("/api/imports/products", (data) => {
      setResult(data as ProductImportResult);
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
      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold">CSV товаров</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Загрузите CSV с заголовками. Категории и поставщики должны уже
          существовать в текущем tenant.
        </p>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Файл CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-950 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        {fileName ? (
          <p className="mt-3 text-sm text-zinc-500">Выбран файл: {fileName}</p>
        ) : null}

        <div className="mt-5 rounded-2xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Поддерживаемые колонки:</p>
          <p>
            Артикул, Наименование, Категория, Поставщик, Входящая цена, Цена
            продажи, Фейсинг, Срок годности
          </p>
        </div>

        <a
          href={buildCsvDownloadHref(template.csv)}
          download={template.fileName}
          className="mt-3 inline-flex rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          Скачать шаблон CSV
        </a>

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
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {isSubmitting ? "Проверка..." : "Проверить"}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport || isSubmitting}
            className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            Импортировать
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
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
              <div>
                <h3 className="text-sm font-semibold">Ошибки</h3>
                <ul className="mt-2 divide-y divide-red-100 rounded-md border border-red-100">
                  {preview.errors.map((item, index) => (
                    <li key={`${item.row}-${item.field}-${index}`} className="px-3 py-2 text-sm text-red-700">
                      Строка {item.row}, поле {item.field}: {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Строка</th>
                    <th className="px-3 py-2 font-medium">Артикул</th>
                    <th className="px-3 py-2 font-medium">Название</th>
                    <th className="px-3 py-2 font-medium">Категория</th>
                    <th className="px-3 py-2 font-medium">Поставщик</th>
                    <th className="px-3 py-2 text-right font-medium">Цена</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {preview.rows.slice(0, 20).map((row) => (
                    <tr key={`${row.row}-${row.article}`}>
                      <td className="px-3 py-2 text-zinc-500">{row.row}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.article}</td>
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-zinc-700">{row.categoryName ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-700">{row.supplierName ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-zinc-700">{row.salePrice}</td>
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

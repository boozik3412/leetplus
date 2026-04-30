"use client";

import { useState } from "react";
import type {
  ProductParsingOverview,
  ProductParsingSuggestion,
} from "@/lib/product-parsing";

function errorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return "Не удалось выполнить действие";
}

export function ProductParsingUtility({
  initialOverview,
}: {
  initialOverview: ProductParsingOverview;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refreshOverview() {
    const response = await fetch("/api/utilities/product-parsing");

    if (response.ok) {
      setOverview((await response.json()) as ProductParsingOverview);
    }
  }

  async function analyze() {
    const confirmed = window.confirm(
      "Процедура длительная и экспериментальная. Она анализирует наименования товаров по всей сети и помогает навести порядок в отчетности. До подтверждения пользователем ничего не применяется. Начать анализ?",
    );

    if (!confirmed) {
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/utilities/product-parsing/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(errorMessage(data));
        return;
      }

      const run = data as { totalProducts?: number; suggestionsCount?: number };
      setNotice(
        `Анализ завершён: обработано ${run.totalProducts ?? 0} товаров, найдено ${run.suggestionsCount ?? 0} групп для проверки.`,
      );
      await refreshOverview();
    } catch {
      setError("API недоступен");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
        <h2 className="text-base font-semibold">
          Экспериментальная длительная процедура
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6">
          Умный парсинг анализирует только наименования товаров и предлагает
          сетевые SKU для отчётности. Он не меняет цены, закупку, поставщиков,
          остатки и продажи. Изменения применяются только после подтверждения
          конкретной группы.
        </p>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Умный парсинг товаров</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Поиск одинаковых товаров по бренду, объёму, вкусу и упаковке.
            </p>
          </div>
          <button
            type="button"
            onClick={analyze}
            disabled={isAnalyzing}
            className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
          >
            {isAnalyzing ? "Анализируем..." : "Начать анализ"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Metric
            label="Канонических товаров"
            value={overview.canonicalProductsCount}
          />
          <Metric label="Ожидают решения" value={overview.pendingSuggestions} />
          <Metric
            label="Последний запуск"
            value={overview.latestRun?.suggestionsCount ?? 0}
          />
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        {(overview.latestRun?.suggestions ?? []).length > 0 ? (
          overview.latestRun?.suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onChanged={refreshOverview}
            />
          ))
        ) : (
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            Нет предложений для подтверждения. Запустите анализ или все найденные
            группы уже обработаны.
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onChanged,
}: {
  suggestion: ProductParsingSuggestion;
  onChanged: () => Promise<void>;
}) {
  const [selectedName, setSelectedName] = useState(suggestion.suggestedName);
  const [selectedProductIds, setSelectedProductIds] = useState(
    suggestion.productIds,
  );
  const [isSaving, setIsSaving] = useState(false);

  async function apply() {
    setIsSaving(true);

    try {
      await fetch(
        `/api/utilities/product-parsing/suggestions/${suggestion.id}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedName,
            productIds: selectedProductIds,
          }),
        },
      );
      await onChanged();
    } finally {
      setIsSaving(false);
    }
  }

  async function reject() {
    setIsSaving(true);

    try {
      await fetch(
        `/api/utilities/product-parsing/suggestions/${suggestion.id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      await onChanged();
    } finally {
      setIsSaving(false);
    }
  }

  function toggleProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  return (
    <article className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{suggestion.suggestedName}</h3>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              {suggestion.confidence}% совпадение
            </span>
            <span
              className={[
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                suggestion.rationale.riskLevel === "LOW"
                  ? "bg-emerald-50 text-emerald-700"
                  : suggestion.rationale.riskLevel === "MEDIUM"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700",
              ].join(" ")}
            >
              {suggestion.rationale.riskLevel === "LOW"
                ? "низкий риск"
                : suggestion.rationale.riskLevel === "MEDIUM"
                  ? "средний риск"
                  : "высокий риск"}
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Бренд: {suggestion.rationale.brand ?? "не найден"} · Объём:{" "}
            {suggestion.rationale.volume ?? "не найден"} · Вкус:{" "}
            {suggestion.rationale.flavor ?? "не найден"} · Вариант:{" "}
            {suggestion.rationale.variant ?? "обычный"} · Упаковка:{" "}
            {suggestion.rationale.packageType ?? "не найдена"}
            {suggestion.rationale.productKind === "hookah-service"
              ? " · Тип: услуга / кальян"
              : ""}
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Домены: {suggestion.rationale.domains.join(", ") || "нет данных"}
          </p>
          {suggestion.rationale.warnings.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-medium">Что настораживает</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {suggestion.rationale.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={apply}
            disabled={isSaving || selectedProductIds.length < 2}
            className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-emerald-400 dark:text-zinc-950"
          >
            Подтвердить
          </button>
          <button
            type="button"
            onClick={reject}
            disabled={isSaving}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Отклонить
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[320px_1fr]">
        <label className="block">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Корректное сетевое название
          </span>
          <select
            value={selectedName}
            onChange={(event) => setSelectedName(event.target.value)}
            className="mt-2 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {suggestion.candidateNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Товары в группе
          </p>
          <div className="mt-2 grid gap-2">
            {suggestion.rationale.products.map((product) => (
              <label
                key={product.id}
                className="flex items-start gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/60"
              >
                <input
                  type="checkbox"
                  checked={selectedProductIds.includes(product.id)}
                  onChange={() => toggleProduct(product.id)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                />
                <span>
                  <span className="font-medium">
                    {product.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {product.sourceLabel} · {product.article}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {[
                      product.parsed.brand,
                      product.parsed.volume,
                      product.parsed.flavor,
                      product.parsed.variant,
                      product.parsed.packageType,
                      product.parsed.productKind === "hookah-service"
                        ? "услуга / кальян"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {product.parsed.residualTokens.length > 0
                      ? ` · остаток: ${product.parsed.residualTokens.join(", ")}`
                      : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

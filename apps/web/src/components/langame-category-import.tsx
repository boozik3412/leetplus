"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  Category,
  LangameCategoryCatalogGroup,
  LangameCategoryCatalogOverview,
} from "@/lib/catalog";

const CREATE_CATEGORY_VALUE = "__create__";

type MappingPayload = {
  externalDomain: string;
  externalGroupId: string;
  categoryId?: string;
  createCategoryName?: string;
  status?: "CONFIRMED";
  confidence?: number;
  action?: "UNMAP";
};

type PreviewItem = {
  productId: string;
  productName: string;
  status: "UNASSIGNED" | "CONFLICT" | "AMBIGUOUS";
  currentCategory: { id: string; name: string } | null;
  candidateCategories: { id: string | null; name: string; isNew: boolean }[];
  sources: { externalDomain: string; externalGroupId: string; storeName: string }[];
};

type Preview = {
  summary: {
    matched: number;
    uncategorized: number;
    conflicts: number;
    ambiguous: number;
  };
  items: PreviewItem[];
};

type ApplyResult = {
  mappingsChanged: number;
  categoriesCreated: number;
  productsUpdated: number;
};

type AssignmentByProduct = Record<string, string>;

function groupKey(group: Pick<LangameCategoryCatalogGroup, "externalDomain" | "externalGroupId">) {
  return `${group.externalDomain}:${group.externalGroupId}`;
}

function initialSelection(groups: LangameCategoryCatalogGroup[]) {
  return Object.fromEntries(
    groups.map((group) => [
      groupKey(group),
      group.mapping?.status === "CONFIRMED" ? group.mapping.categoryId : "",
    ]),
  ) as Record<string, string>;
}

function buildMappings(
  groups: LangameCategoryCatalogGroup[],
  selection: Record<string, string>,
): MappingPayload[] {
  return groups.flatMap<MappingPayload>((group) => {
    const target = selection[groupKey(group)] ?? "";
    const wasConfirmed = group.mapping?.status === "CONFIRMED";

    if (!target) {
      return wasConfirmed
        ? [
            {
              externalDomain: group.externalDomain,
              externalGroupId: group.externalGroupId,
              action: "UNMAP" as const,
            },
          ]
        : [];
    }

    return [
      {
        externalDomain: group.externalDomain,
        externalGroupId: group.externalGroupId,
        ...(target === CREATE_CATEGORY_VALUE
          ? { createCategoryName: group.name }
          : { categoryId: target }),
        status: "CONFIRMED" as const,
        confidence: 100,
      },
    ];
  });
}

function responseMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return "Не удалось выполнить запрос";
}

function formatDate(value: string | null) {
  if (!value) {
    return "ещё не обновлялся";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function previewStatusLabel(status: PreviewItem["status"]) {
  if (status === "CONFLICT") {
    return "Конфликт";
  }

  if (status === "AMBIGUOUS") {
    return "Нужен выбор";
  }

  return "Без категории LeetPlus";
}

export function LangameCategoryImport({
  categories,
  overview,
  canEditCatalog,
  canEditProducts,
}: {
  categories: Category[];
  overview: LangameCategoryCatalogOverview;
  canEditCatalog: boolean;
  canEditProducts: boolean;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState(() => initialSelection(overview.groups));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [assignments, setAssignments] = useState<AssignmentByProduct>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const mappings = useMemo(
    () => buildMappings(overview.groups, selection),
    [overview.groups, selection],
  );

  function selectCategory(group: LangameCategoryCatalogGroup, value: string) {
    setSelection((current) => ({ ...current, [groupKey(group)]: value }));
    setPreview(null);
    setAssignments({});
    setMessage(null);
    setError(null);
  }

  async function handlePreview() {
    setError(null);
    setMessage(null);

    if (mappings.length === 0) {
      setError("Выберите хотя бы одну категорию Langame для сопоставления.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/categories/langame/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mappings }),
        });
        const payload = (await response.json()) as Preview | { message?: string };

        if (!response.ok) {
          setError(responseMessage(payload));
          return;
        }

        setPreview(payload as Preview);
        setAssignments({});
      } catch {
        setError("API недоступен");
      }
    });
  }

  async function handleApply() {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const resolutions = preview
          ? preview.items.flatMap((item) => {
              const categoryId = assignments[item.productId];
              const source = item.sources[0];

              if (!categoryId || !source) {
                return [];
              }

              return [
                {
                  productId: item.productId,
                  categoryId,
                  externalDomain: source.externalDomain,
                  externalGroupId: source.externalGroupId,
                },
              ];
            })
          : [];
        const response = await fetch("/api/categories/langame/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mappings, resolutions }),
        });
        const payload = (await response.json()) as ApplyResult | { message?: string };

        if (!response.ok) {
          setError(responseMessage(payload));
          return;
        }

        const result = payload as ApplyResult;
        setMessage(
          `Сохранено сопоставлений: ${result.mappingsChanged}; создано категорий: ${result.categoriesCreated}; обновлено SKU: ${result.productsUpdated}.`,
        );
        setPreview(null);
        setAssignments({});
        router.refresh();
      } catch {
        setError("API недоступен");
      }
    });
  }

  async function handleRefresh() {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/categories/langame/refresh", {
          method: "POST",
        });
        const payload = (await response.json()) as { failedSources?: number; message?: string };

        if (!response.ok) {
          setError(responseMessage(payload));
          return;
        }

        setMessage(
          payload.failedSources
            ? "Справочник обновлён не для всех источников: проверьте синхронизацию."
            : "Справочник Langame обновлён.",
        );
        router.refresh();
      } catch {
        setError("API недоступен");
      }
    });
  }

  return (
    <section className="mt-8 rounded-lg border border-sky-200 bg-sky-50/40 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            Источник: Langame
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950">
            Импорт и сопоставление внешних категорий
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Внешние группы не заменяют категории LeetPlus. Совпадение названия —
            только подсказка, а изменения применяются после предпросмотра.
          </p>
        </div>
        {canEditCatalog ? (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:text-sky-400"
          >
            {isPending ? "Обновление..." : "Обновить из Langame"}
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Активные группы" value={`${overview.summary.activeGroups} из ${overview.summary.groups}`} />
        <Stat label="Без группы Langame" value={String(overview.summary.configurationsWithoutGroup)} />
        <Stat label="Нет локального SKU" value={String(overview.summary.unlinkedProducts)} />
        <Stat label="Без LeetPlus-категории" value={String(overview.summary.uncategorizedProducts)} />
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Последнее обновление: {formatDate(overview.latestSyncedAt)}.
      </p>

      {overview.warnings.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {overview.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-md border border-sky-100 bg-white">
        <table className="min-w-[980px] divide-y divide-zinc-100 text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-3 font-medium">Группа Langame</th>
              <th className="px-3 py-3 font-medium">Покрытие</th>
              <th className="px-3 py-3 font-medium">Предупреждения</th>
              <th className="px-3 py-3 font-medium">Категория LeetPlus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {overview.groups.map((group) => (
              <LangameGroupRow
                key={groupKey(group)}
                group={group}
                categories={categories}
                selectedCategoryId={selection[groupKey(group)] ?? ""}
                canEditCatalog={canEditCatalog}
                onSelect={selectCategory}
              />
            ))}
            {overview.groups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  После первой синхронизации здесь появятся группы Langame.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {canEditCatalog ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePreview}
            disabled={isPending || mappings.length === 0}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isPending ? "Подготовка..." : "Предпросмотр изменений"}
          </button>
          <span className="text-xs text-zinc-500">
            Выбрано сопоставлений: {mappings.filter((mapping) => mapping.action !== "UNMAP").length}.
          </span>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}

      {preview ? (
        <PreviewPanel
          preview={preview}
          categories={categories}
          assignments={assignments}
          canEditProducts={canEditProducts}
          isPending={isPending}
          onAssignmentChange={(productId, categoryId) =>
            setAssignments((current) => ({ ...current, [productId]: categoryId }))
          }
          onApply={handleApply}
        />
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-sky-100 bg-white px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function LangameGroupRow({
  group,
  categories,
  selectedCategoryId,
  canEditCatalog,
  onSelect,
}: {
  group: LangameCategoryCatalogGroup;
  categories: Category[];
  selectedCategoryId: string;
  canEditCatalog: boolean;
  onSelect: (group: LangameCategoryCatalogGroup, value: string) => void;
}) {
  return (
    <tr className={group.isActive && !group.isDeleted ? "" : "bg-zinc-50 text-zinc-500"}>
      <td className="px-3 py-3 align-top">
        <p className="font-medium text-zinc-900">{group.name}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {group.externalDomain} · ID {group.externalGroupId}
        </p>
      </td>
      <td className="px-3 py-3 align-top text-xs text-zinc-600">
        <p>SKU: {group.productCount} · клубов: {group.storesCount}</p>
        <p className="mt-1">Связано с LeetPlus: {group.linkedProductCount}</p>
      </td>
      <td className="px-3 py-3 align-top text-xs">
        {group.conflictProductCount > 0 ? (
          <p className="text-amber-700">Конфликтов: {group.conflictProductCount}</p>
        ) : null}
        {group.uncategorizedProductCount > 0 ? (
          <p className="mt-1 text-amber-700">Без LeetPlus: {group.uncategorizedProductCount}</p>
        ) : null}
        {group.unmatchedProductCount > 0 ? (
          <p className="mt-1 text-zinc-500">Нет локального SKU: {group.unmatchedProductCount}</p>
        ) : null}
        {group.conflictProductCount === 0 &&
        group.uncategorizedProductCount === 0 &&
        group.unmatchedProductCount === 0 ? (
          <p className="text-emerald-700">Покрытие без предупреждений</p>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top">
        {canEditCatalog ? (
          <select
            value={selectedCategoryId}
            onChange={(event) => onSelect(group, event.target.value)}
            className="w-full min-w-56 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          >
            <option value="">Не сопоставлять</option>
            <option value={CREATE_CATEGORY_VALUE}>Создать «{group.name}»</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm font-medium text-zinc-800">
            {group.mapping?.status === "CONFIRMED"
              ? group.mapping.categoryName
              : "Не сопоставлена"}
          </p>
        )}
        {group.mapping?.status === "CONFIRMED" ? (
          <p className="mt-1 text-xs text-emerald-700">Подтверждено вручную</p>
        ) : null}
        {group.suggestedCategory && !group.mapping ? (
          <p className="mt-1 text-xs text-sky-700">
            Подсказка по названию: {group.suggestedCategory.name}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

function PreviewPanel({
  preview,
  categories,
  assignments,
  canEditProducts,
  isPending,
  onAssignmentChange,
  onApply,
}: {
  preview: Preview;
  categories: Category[];
  assignments: AssignmentByProduct;
  canEditProducts: boolean;
  isPending: boolean;
  onAssignmentChange: (productId: string, categoryId: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="mt-6 rounded-md border border-zinc-200 bg-white p-4">
      <h3 className="text-base font-semibold text-zinc-950">Предпросмотр конфликтов</h3>
      <p className="mt-1 text-sm text-zinc-600">
        По умолчанию внутренняя категория LeetPlus сохранится. Выберите новую только для SKU, которые действительно нужно изменить.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <Stat label="Совпадают" value={String(preview.summary.matched)} />
        <Stat label="Без LeetPlus" value={String(preview.summary.uncategorized)} />
        <Stat label="Конфликты" value={String(preview.summary.conflicts)} />
        <Stat label="Неоднозначно" value={String(preview.summary.ambiguous)} />
      </div>

      {preview.items.length > 0 ? (
        <div className="mt-4 max-h-[34rem] overflow-y-auto rounded-md border border-zinc-200">
          <div className="divide-y divide-zinc-100">
            {preview.items.map((item) => (
              <div
                key={item.productId}
                className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_12rem_14rem] md:items-center"
                style={{ contentVisibility: "auto", containIntrinsicSize: "96px" }}
              >
                <div>
                  <p className="font-medium text-zinc-900">{item.productName}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {previewStatusLabel(item.status)} · LeetPlus: {item.currentCategory?.name ?? "не назначена"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Langame: {item.sources.map((source) => `${source.storeName} — ${source.externalDomain} / ${source.externalGroupId}`).join("; ")}
                  </p>
                </div>
                <div className="text-xs text-zinc-600">
                  Кандидат: {item.candidateCategories.map((category) => category.name).join(" / ")}
                </div>
                {canEditProducts ? (
                  <select
                    value={assignments[item.productId] ?? ""}
                    onChange={(event) => onAssignmentChange(item.productId, event.target.value)}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="">Сохранить LeetPlus</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        Назначить: {category.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-zinc-500">Нет права менять SKU</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          Конфликтов и незаполненных категорий среди выбранных сопоставлений нет.
        </p>
      )}

      <button
        type="button"
        onClick={onApply}
        disabled={isPending}
        className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
      >
        {isPending ? "Применение..." : "Подтвердить сопоставления"}
      </button>
    </div>
  );
}

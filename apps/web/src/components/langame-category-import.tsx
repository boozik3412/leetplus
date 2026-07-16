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
  autoAssignedProducts?: number;
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

function addExactNameSuggestions(
  groups: LangameCategoryCatalogGroup[],
  selection: Record<string, string>,
) {
  return Object.fromEntries(
    groups.map((group) => {
      const key = groupKey(group);
      const selected = selection[key];

      return [
        key,
        selected ||
          (group.mapping?.status === "CONFIRMED"
            ? group.mapping.categoryId
            : group.suggestedCategory?.id ?? ""),
      ];
    }),
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
              action: "UNMAP",
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
        status: "CONFIRMED",
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
  const [plannerOpen, setPlannerOpen] = useState(
    () => overview.groups.some((group) => group.mapping?.status === "CONFIRMED"),
  );
  const [createMissing, setCreateMissing] = useState(false);
  const [assignUncategorized, setAssignUncategorized] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [assignments, setAssignments] = useState<AssignmentByProduct>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const mappings = useMemo(
    () => buildMappings(overview.groups, selection),
    [overview.groups, selection],
  );
  const suggestedGroups = overview.groups.filter(
    (group) => group.mapping?.status !== "CONFIRMED" && Boolean(group.suggestedCategory),
  );
  const unmappedGroups = overview.groups.filter(
    (group) => group.mapping?.status !== "CONFIRMED" && !group.suggestedCategory,
  );
  const mappedGroups = mappings.filter((mapping) => mapping.action !== "UNMAP");
  const createdGroupCount = mappedGroups.filter(
    (mapping) => Boolean(mapping.createCategoryName),
  ).length;

  function resetPreview() {
    setPreview(null);
    setAssignments({});
    setAssignUncategorized(false);
    setMessage(null);
    setError(null);
  }

  function selectCategory(group: LangameCategoryCatalogGroup, value: string) {
    setSelection((current) => ({ ...current, [groupKey(group)]: value }));
    resetPreview();
    setPlannerOpen(true);
  }

  function requestPreview(nextSelection: Record<string, string>) {
    const nextMappings = buildMappings(overview.groups, nextSelection);

    if (nextMappings.every((mapping) => mapping.action === "UNMAP")) {
      setPreview(null);
      setError("Выберите хотя бы одну внешнюю группу для импорта.");
      return;
    }

    startTransition(async () => {
      setError(null);
      setMessage(null);

      try {
        const response = await fetch("/api/categories/langame/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mappings: nextMappings }),
        });
        const payload = (await response.json()) as Preview | { message?: string };

        if (!response.ok) {
          setError(responseMessage(payload));
          return;
        }

        setPreview(payload as Preview);
        setAssignments({});
        setAssignUncategorized(false);
      } catch {
        setError("API недоступен");
      }
    });
  }

  function handlePreparePlan() {
    const nextSelection = addExactNameSuggestions(overview.groups, selection);
    setSelection(nextSelection);
    setPlannerOpen(true);
    setPreview(null);
    setAssignments({});
    setAssignUncategorized(false);
    requestPreview(nextSelection);
  }

  function handleCreateMissingChange(checked: boolean) {
    const nextSelection = { ...selection };

    for (const group of overview.groups) {
      const key = groupKey(group);

      if (group.mapping?.status === "CONFIRMED") {
        continue;
      }

      if (checked && !nextSelection[key]) {
        nextSelection[key] = group.suggestedCategory?.id ?? CREATE_CATEGORY_VALUE;
      }

      if (!checked && nextSelection[key] === CREATE_CATEGORY_VALUE) {
        nextSelection[key] = "";
      }
    }

    setCreateMissing(checked);
    setSelection(nextSelection);
    resetPreview();
    setPlannerOpen(true);
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
          body: JSON.stringify({
            mappings,
            resolutions,
            assignUncategorized,
          }),
        });
        const payload = (await response.json()) as ApplyResult | { message?: string };

        if (!response.ok) {
          setError(responseMessage(payload));
          return;
        }

        const result = payload as ApplyResult;
        setMessage(
          `Сопоставлений сохранено: ${result.mappingsChanged}; создано внутренних категорий: ${result.categoriesCreated}; обновлено SKU: ${result.productsUpdated}.`,
        );
        setPreview(null);
        setAssignments({});
        setAssignUncategorized(false);
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
    <section className="mt-6 rounded-lg border border-sky-200 bg-sky-50/40 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            Источник: Langame
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950">
            Импорт категорий из Langame
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Сначала подготовьте план, затем проверьте товары и только после этого
            подтвердите изменения. Внутренние категории LeetPlus не заменяются
            автоматически.
          </p>
        </div>
        {canEditCatalog ? (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:text-sky-400"
          >
            {isPending ? "Обновление..." : "Обновить данные Langame"}
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <SummaryMetric
          label="Внешние группы"
          value={`${overview.summary.activeGroups} из ${overview.summary.groups}`}
          detail={`обновлены ${formatDate(overview.latestSyncedAt)}`}
        />
        <SummaryMetric
          label="Точные совпадения названий"
          value={String(suggestedGroups.length)}
          detail="можно принять одним действием"
        />
        <SummaryMetric
          label="SKU без LeetPlus-категории"
          value={String(overview.summary.uncategorizedProducts)}
          detail="не изменятся без отдельного выбора"
        />
      </div>

      {overview.warnings.length > 0 ? (
        <details className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <summary className="cursor-pointer font-medium">
            Проверить качество данных Langame · предупреждений: {overview.warnings.length}
          </summary>
          <div className="mt-2 space-y-1 text-xs">
            {overview.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </details>
      ) : null}

      {overview.groups.length === 0 ? (
        <div className="mt-5 rounded-md border border-dashed border-sky-200 bg-white px-4 py-5 text-sm text-zinc-600">
          Группы появятся здесь после первой синхронизации Langame.
        </div>
      ) : !canEditCatalog ? (
        <div className="mt-5 rounded-md border border-sky-100 bg-white px-4 py-4 text-sm text-zinc-600">
          Для настройки импорта нужна роль с правом редактировать каталог.
        </div>
      ) : !plannerOpen ? (
        <StartImportCard
          exactMatches={suggestedGroups.length}
          remainingGroups={unmappedGroups.length}
          isPending={isPending}
          onPrepare={handlePreparePlan}
        />
      ) : (
        <div className="mt-5 rounded-md border border-sky-100 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Шаг 1 из 3</p>
              <h3 className="mt-1 text-base font-semibold text-zinc-950">Соберите план импорта</h3>
              <p className="mt-1 max-w-2xl text-sm text-zinc-600">
                Точные совпадения уже предложены, но ещё не сохранены. Остальные
                группы можно оставить внешними, создать для них внутренние категории
                или настроить вручную.
              </p>
            </div>
            <button
              type="button"
              onClick={() => requestPreview(selection)}
              disabled={isPending || mappedGroups.length === 0}
              className="shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {isPending ? "Подготовка..." : preview ? "Обновить предпросмотр" : "Проверить план"}
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <SummaryMetric label="Будет сопоставлено" value={String(mappedGroups.length)} detail="групп Langame" />
            <SummaryMetric label="Будет создано" value={String(createdGroupCount)} detail="новых внутренних категорий" />
            <SummaryMetric label="Останется без связи" value={String(Math.max(overview.groups.length - mappedGroups.length, 0))} detail="внешних групп" />
          </div>

          {unmappedGroups.length > 0 ? (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={createMissing}
                onChange={(event) => handleCreateMissingChange(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-sky-700 focus:ring-sky-500"
              />
              <span>
                <span className="font-medium text-zinc-900">
                  Создать категории LeetPlus для оставшихся групп
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  Это добавит внутренние категории только после подтверждения импорта.
                  Одноимённые группы будут использовать одну внутреннюю категорию.
                </span>
              </span>
            </label>
          ) : null}

          <details className="mt-4 rounded-md border border-zinc-200">
            <summary className="cursor-pointer px-3 py-3 text-sm font-medium text-zinc-800">
              Настроить группы вручную · {overview.groups.length}
            </summary>
            <div className="grid gap-2 border-t border-zinc-100 p-3 sm:grid-cols-2">
              {overview.groups.map((group) => (
                <LangameGroupCard
                  key={groupKey(group)}
                  group={group}
                  categories={categories}
                  selectedCategoryId={selection[groupKey(group)] ?? ""}
                  onSelect={selectCategory}
                />
              ))}
            </div>
          </details>

          {preview ? (
            <PreviewPanel
              preview={preview}
              categories={categories}
              assignments={assignments}
              assignUncategorized={assignUncategorized}
              canEditProducts={canEditProducts}
              isPending={isPending}
              mappedGroups={mappedGroups.length}
              createdGroupCount={createdGroupCount}
              onAssignUncategorizedChange={setAssignUncategorized}
              onAssignmentChange={(productId, categoryId) =>
                setAssignments((current) => ({ ...current, [productId]: categoryId }))
              }
              onApply={handleApply}
            />
          ) : (
            <p className="mt-4 text-xs text-zinc-500">
              Выберите вариант и нажмите «Проверить план». До подтверждения ничего не
              будет создано и ни один SKU не изменится.
            </p>
          )}
        </div>
      )}

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
    </section>
  );
}

function StartImportCard({
  exactMatches,
  remainingGroups,
  isPending,
  onPrepare,
}: {
  exactMatches: number;
  remainingGroups: number;
  isPending: boolean;
  onPrepare: () => void;
}) {
  return (
    <div className="mt-5 rounded-md border border-sky-100 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Шаг 1 из 3</p>
      <h3 className="mt-1 text-base font-semibold text-zinc-950">Подготовьте безопасный план</h3>
      <p className="mt-1 max-w-2xl text-sm text-zinc-600">
        Мы предложим только точные совпадения названий. Остальные внешние группы
        останутся без внутренней категории, пока вы явно не выберете другой вариант.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
          {exactMatches} точных совпадений
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600">
          {remainingGroups} групп потребуют решения
        </span>
      </div>
      <button
        type="button"
        onClick={onPrepare}
        disabled={isPending}
        className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isPending ? "Подготовка..." : "Подготовить план"}
      </button>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-sky-100 bg-white px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-zinc-900">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function LangameGroupCard({
  group,
  categories,
  selectedCategoryId,
  onSelect,
}: {
  group: LangameCategoryCatalogGroup;
  categories: Category[];
  selectedCategoryId: string;
  onSelect: (group: LangameCategoryCatalogGroup, value: string) => void;
}) {
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);

  return (
    <div className="rounded-md border border-zinc-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-zinc-900">{group.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {group.externalDomain} · ID {group.externalGroupId}
          </p>
        </div>
        <span className="shrink-0 text-xs text-zinc-500">{group.productCount} SKU</span>
      </div>
      <select
        value={selectedCategoryId}
        onChange={(event) => onSelect(group, event.target.value)}
        className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      >
        <option value="">Оставить только в Langame</option>
        <option value={CREATE_CATEGORY_VALUE}>Создать «{group.name}» в LeetPlus</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-zinc-500">
        {selectedCategoryId === CREATE_CATEGORY_VALUE
          ? "Будет создана после подтверждения."
          : selectedCategory
            ? `LeetPlus: ${selectedCategory.name}`
            : group.mapping?.status === "CONFIRMED"
              ? "Подтверждённая связь будет удалена после подтверждения."
              : group.suggestedCategory
                ? `Точная подсказка: ${group.suggestedCategory.name}`
                : "Внутренняя категория не выбрана."}
      </p>
    </div>
  );
}

function PreviewPanel({
  preview,
  categories,
  assignments,
  assignUncategorized,
  canEditProducts,
  isPending,
  mappedGroups,
  createdGroupCount,
  onAssignUncategorizedChange,
  onAssignmentChange,
  onApply,
}: {
  preview: Preview;
  categories: Category[];
  assignments: AssignmentByProduct;
  assignUncategorized: boolean;
  canEditProducts: boolean;
  isPending: boolean;
  mappedGroups: number;
  createdGroupCount: number;
  onAssignUncategorizedChange: (value: boolean) => void;
  onAssignmentChange: (productId: string, categoryId: string) => void;
  onApply: () => void;
}) {
  const reviewItems = preview.items.filter((item) => item.status !== "UNASSIGNED");

  return (
    <div className="mt-5 border-t border-zinc-100 pt-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Шаг 2 из 3</p>
      <h3 className="mt-1 text-base font-semibold text-zinc-950">Проверьте товары перед применением</h3>
      <p className="mt-1 text-sm text-zinc-600">
        Существующие категории LeetPlus сохраняются. Конфликты и неоднозначные SKU
        не изменяются, пока вы не выберете решение вручную.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <SummaryMetric label="Совпадают" value={String(preview.summary.matched)} detail="SKU без изменений" />
        <SummaryMetric label="Без LeetPlus" value={String(preview.summary.uncategorized)} detail="можно назначить отдельно" />
        <SummaryMetric label="Конфликты" value={String(preview.summary.conflicts)} detail="сохранятся по умолчанию" />
        <SummaryMetric label="Неоднозначно" value={String(preview.summary.ambiguous)} detail="нужно ручное решение" />
      </div>

      {preview.summary.uncategorized > 0 ? (
        canEditProducts ? (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
            <input
              type="checkbox"
              checked={assignUncategorized}
              onChange={(event) => onAssignUncategorizedChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-700 focus:ring-emerald-500"
            />
            <span>
              <span className="font-medium">
                Назначить категории {preview.summary.uncategorized} SKU без LeetPlus-категории
              </span>
              <span className="mt-0.5 block text-xs text-emerald-800">
                Назначатся только активные SKU с одной однозначной категорией Langame.
                SKU из разных категорий в разных клубах останутся на ручную проверку.
              </span>
            </span>
          </label>
        ) : (
          <p className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">
            {preview.summary.uncategorized} SKU не имеют внутренней категории. Для
            массового назначения нужно право редактировать товары.
          </p>
        )
      ) : null}

      {reviewItems.length > 0 ? (
        <details className="mt-4 rounded-md border border-amber-200 bg-amber-50/50">
          <summary className="cursor-pointer px-3 py-3 text-sm font-medium text-amber-950">
            Разобрать конфликты и неоднозначные SKU · {reviewItems.length}
          </summary>
          <div className="max-h-[32rem] divide-y divide-amber-100 overflow-y-auto border-t border-amber-100 bg-white">
            {reviewItems.map((item) => (
              <ProductDecisionRow
                key={item.productId}
                item={item}
                categories={categories}
                assignment={assignments[item.productId] ?? ""}
                canEditProducts={canEditProducts}
                onAssignmentChange={onAssignmentChange}
              />
            ))}
          </div>
        </details>
      ) : (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          Конфликтов и неоднозначных SKU в этом плане нет.
        </p>
      )}

      <div className="mt-5 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Шаг 3 из 3</p>
        <p className="mt-1 text-sm text-zinc-700">
          Подтвердить: сопоставлений — {mappedGroups}, новых внутренних категорий — {createdGroupCount}
          {assignUncategorized ? `, назначить SKU без категории — ${preview.summary.uncategorized}` : ""}.
        </p>
        <button
          type="button"
          onClick={onApply}
          disabled={isPending}
          className="mt-3 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-400"
        >
          {isPending ? "Применение..." : "Подтвердить импорт"}
        </button>
      </div>
    </div>
  );
}

function ProductDecisionRow({
  item,
  categories,
  assignment,
  canEditProducts,
  onAssignmentChange,
}: {
  item: PreviewItem;
  categories: Category[];
  assignment: string;
  canEditProducts: boolean;
  onAssignmentChange: (productId: string, categoryId: string) => void;
}) {
  const label = item.status === "CONFLICT" ? "Конфликт" : "Нужен выбор";

  return (
    <div className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_14rem] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-zinc-900">{item.productName}</p>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{label}</span>
        </div>
        <p className="mt-1 text-xs text-zinc-600">
          LeetPlus: {item.currentCategory?.name ?? "не назначена"} · Langame: {item.candidateCategories.map((category) => category.name).join(" / ")}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {item.sources.map((source) => `${source.storeName} — ${source.externalDomain}`).join("; ")}
        </p>
      </div>
      {canEditProducts ? (
        <select
          value={assignment}
          onChange={(event) => onAssignmentChange(item.productId, event.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        >
          <option value="">Сохранить LeetPlus как есть</option>
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
  );
}

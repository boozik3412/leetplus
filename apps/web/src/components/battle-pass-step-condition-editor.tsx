"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  GuestGameMissionProductGroup,
  GuestGameMissionProductGroupCatalog,
  GuestGameMissionWizardTaskType,
} from "@/lib/guest-gamification";
import type { Product } from "@/lib/products";
import type { Store } from "@/lib/stores";

export type BattlePassStepConditionValue = {
  schemaVersion?: number;
  taskType: GuestGameMissionWizardTaskType;
  sessionType: "ANY" | "HOURLY" | "PACKAGE_OR_SUBSCRIPTION";
  target: number;
  windowDays: number;
  hours: string;
  weekdays: number[];
  minSessionMinutes: number;
  purchaseSource: "PRODUCT" | "CATEGORY";
  categoryCatalogSource: "LANGAME" | "LEETPLUS";
  productMatch: "ANY" | "ALL";
  amountMode: "NONE" | "SINGLE_MINIMUM" | "PERIOD_TOTAL";
  minimumAmount: number;
  totalAmount: number;
  productIds: string[];
  categorySelectionIds: string[];
  categorySelectionLabels: Array<{ id: string; name: string }>;
  topupMode: "SINGLE" | "COUNT" | "PERIOD_TOTAL";
  topupComparison: "EXACT" | "AT_LEAST";
  topupAmount: number;
  topupCount: number;
  checkInMode: "SINGLE" | "COUNT" | "PERIOD" | "STREAK";
  checkInCount: number;
  checkInDays: number;
  specificDayEnabled: boolean;
  specificTimeEnabled: boolean;
};

export const defaultBattlePassStepCondition: BattlePassStepConditionValue = {
  schemaVersion: 2,
  taskType: "PLAY_TIME",
  sessionType: "ANY",
  target: 60,
  windowDays: 30,
  hours: "09:00-21:00",
  weekdays: [],
  minSessionMinutes: 0,
  purchaseSource: "PRODUCT",
  categoryCatalogSource: "LANGAME",
  productMatch: "ANY",
  amountMode: "NONE",
  minimumAmount: 200,
  totalAmount: 1000,
  productIds: [],
  categorySelectionIds: [],
  categorySelectionLabels: [],
  topupMode: "SINGLE",
  topupComparison: "AT_LEAST",
  topupAmount: 500,
  topupCount: 3,
  checkInMode: "SINGLE",
  checkInCount: 5,
  checkInDays: 7,
  specificDayEnabled: false,
  specificTimeEnabled: false,
};

const fieldClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:focus:ring-emerald-950";
const subClass =
  "rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20";
const weekdayOptions = [
  [1, "Пн"],
  [2, "Вт"],
  [3, "Ср"],
  [4, "Чт"],
  [5, "Пт"],
  [6, "Сб"],
  [0, "Вс"],
] as const;

export function BattlePassStepConditionEditor({
  value,
  storeIds,
  stores,
  products,
  onChange,
}: {
  value: BattlePassStepConditionValue;
  storeIds: string[];
  stores: Store[];
  products: Product[];
  onChange: (value: BattlePassStepConditionValue) => void;
}) {
  const [productQuery, setProductQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [groups, setGroups] = useState<GuestGameMissionProductGroup[]>([]);
  const [categoryWarnings, setCategoryWarnings] = useState<string[]>([]);
  const [loadedGroupKey, setLoadedGroupKey] = useState<string | null>(null);
  const patch = (next: Partial<BattlePassStepConditionValue>) =>
    onChange({ ...value, ...next, schemaVersion: 2 });
  const availableProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.isActive &&
          (!storeIds.length ||
            product.storeIds.some((storeId) => storeIds.includes(storeId))),
      ),
    [products, storeIds],
  );
  const productResults = useMemo(() => {
    const query = productQuery.trim().toLocaleLowerCase("ru-RU");
    if (query.length < 3) return [];
    return availableProducts
      .filter(
        (product) =>
          !value.productIds.includes(product.id) &&
          [product.name, product.article, product.category?.name]
            .filter(Boolean)
            .some((item) =>
              String(item).toLocaleLowerCase("ru-RU").includes(query),
            ),
      )
      .slice(0, 12);
  }, [availableProducts, productQuery, value.productIds]);
  const selectedProducts = value.productIds.map((id) => ({
    id,
    name:
      products.find((product) => product.id === id)?.name ??
      "Сохранённый товар",
  }));
  const groupResults = useMemo(() => {
    const query = categoryQuery.trim().toLocaleLowerCase("ru-RU");
    const source =
      query.length >= 3
        ? groups.filter((group) =>
            group.name.toLocaleLowerCase("ru-RU").includes(query),
          )
        : groups;
    return source
      .filter((group) => !value.categorySelectionIds.includes(group.id))
      .slice(0, 20);
  }, [categoryQuery, groups, value.categorySelectionIds]);
  const categoryLoadKey = `${value.categoryCatalogSource}:${[...storeIds]
    .sort()
    .join(",")}`;
  const loadingGroups =
    value.taskType === "PRODUCT_PURCHASE" &&
    value.purchaseSource === "CATEGORY" &&
    loadedGroupKey !== categoryLoadKey;

  useEffect(() => {
    if (
      value.taskType !== "PRODUCT_PURCHASE" ||
      value.purchaseSource !== "CATEGORY"
    ) {
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ source: value.categoryCatalogSource });
    storeIds.forEach((storeId) => params.append("storeId", storeId));
    fetch(`/api/guests/gamification/missions/wizard/product-groups?${params}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Категории недоступны");
        return response.json() as Promise<GuestGameMissionProductGroupCatalog>;
      })
      .then((catalog) => {
        setGroups(catalog.groups);
        setCategoryWarnings(catalog.warnings);
        setLoadedGroupKey(categoryLoadKey);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setGroups([]);
          setCategoryWarnings([
            error instanceof Error
              ? error.message
              : "Не удалось загрузить категории",
          ]);
          setLoadedGroupKey(categoryLoadKey);
        }
      });
    return () => controller.abort();
  }, [
    categoryLoadKey,
    storeIds,
    value.categoryCatalogSource,
    value.purchaseSource,
    value.taskType,
  ]);

  const selectedDomains = [
    ...new Set(
      stores
        .filter((store) => !storeIds.length || storeIds.includes(store.id))
        .map((store) => store.externalDomain)
        .filter((domain): domain is string => Boolean(domain)),
    ),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
        Условия активации шага
      </p>
      <Field label="Тип условия">
        <select
          className={fieldClass}
          value={value.taskType}
          onChange={(event) =>
            patch({
              taskType: event.target
                .value as BattlePassStepConditionValue["taskType"],
            })
          }
        >
          <option value="PLAY_TIME">Игровое время</option>
          <option value="PRODUCT_PURCHASE">Покупка</option>
          <option value="BALANCE_TOPUP">Пополнение баланса</option>
          <option value="CHECK_IN">Чекин</option>
        </select>
      </Field>

      {value.taskType === "PLAY_TIME" ? (
        <div className={subClass}>
          <SectionTitle>Игровое время</SectionTitle>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Тип сессии">
              <select
                className={fieldClass}
                value={value.sessionType}
                onChange={(event) =>
                  patch({
                    sessionType: event.target
                      .value as BattlePassStepConditionValue["sessionType"],
                  })
                }
              >
                <option value="ANY">Любая</option>
                <option value="HOURLY">Почасовая</option>
                <option value="PACKAGE_OR_SUBSCRIPTION">
                  Пакет или абонемент
                </option>
              </select>
            </Field>
            <NumberField
              label="Цель, минут"
              value={value.target}
              onChange={(target) => patch({ target })}
            />
            <NumberField
              label="Минимум минут в сессии"
              value={value.minSessionMinutes}
              onChange={(minSessionMinutes) => patch({ minSessionMinutes })}
            />
          </div>
          <ScheduleFields value={value} patch={patch} />
        </div>
      ) : null}

      {value.taskType === "PRODUCT_PURCHASE" ? (
        <div className="space-y-3">
          <div className={subClass}>
            <SectionTitle>Что считается покупкой</SectionTitle>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Основание условия">
                <select
                  className={fieldClass}
                  value={value.purchaseSource}
                  onChange={(event) =>
                    patch({
                      purchaseSource: event.target
                        .value as BattlePassStepConditionValue["purchaseSource"],
                      productIds: [],
                      categorySelectionIds: [],
                      categorySelectionLabels: [],
                    })
                  }
                >
                  <option value="PRODUCT">Конкретные товары</option>
                  <option value="CATEGORY">Категории товаров</option>
                </select>
              </Field>
              <Field label="Как сопоставлять">
                <select
                  className={fieldClass}
                  value={value.productMatch}
                  onChange={(event) =>
                    patch({
                      productMatch: event.target
                        .value as BattlePassStepConditionValue["productMatch"],
                    })
                  }
                >
                  <option value="ANY">Любой из выбранных</option>
                  <option value="ALL">Все выбранные за период</option>
                </select>
              </Field>
              <Field label="Условие по сумме">
                <select
                  className={fieldClass}
                  value={value.amountMode}
                  onChange={(event) =>
                    patch({
                      amountMode: event.target
                        .value as BattlePassStepConditionValue["amountMode"],
                    })
                  }
                >
                  <option value="NONE">Без ограничения</option>
                  <option value="SINGLE_MINIMUM">Одна покупка не менее</option>
                  <option value="PERIOD_TOTAL">Сумма за период</option>
                </select>
              </Field>
            </div>
            {value.amountMode !== "NONE" ? (
              <div className="mt-3 max-w-sm">
                <NumberField
                  label={
                    value.amountMode === "PERIOD_TOTAL"
                      ? "Накопленная сумма, ₽"
                      : "Минимальная сумма, ₽"
                  }
                  value={
                    value.amountMode === "PERIOD_TOTAL"
                      ? value.totalAmount
                      : value.minimumAmount
                  }
                  onChange={(amount) =>
                    patch(
                      value.amountMode === "PERIOD_TOTAL"
                        ? { totalAmount: amount }
                        : { minimumAmount: amount },
                    )
                  }
                />
              </div>
            ) : null}
          </div>

          {value.purchaseSource === "PRODUCT" ? (
            <div className={subClass}>
              <SectionTitle>Товары выбранных клубов</SectionTitle>
              <input
                className={fieldClass}
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Введите минимум 3 буквы названия товара"
              />
              {productResults.length ? (
                <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto md:grid-cols-2">
                  {productResults.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950"
                      onClick={() => {
                        patch({
                          productIds: [...value.productIds, product.id],
                        });
                        setProductQuery("");
                      }}
                    >
                      <strong className="block">{product.name}</strong>
                      <span className="text-xs text-zinc-500">
                        {product.category?.name ?? product.article ?? "Товар"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : productQuery.trim().length >= 3 ? (
                <Hint>Подходящие товары не найдены.</Hint>
              ) : null}
              <Chips
                items={selectedProducts}
                onRemove={(id) =>
                  patch({
                    productIds: value.productIds.filter((item) => item !== id),
                  })
                }
                onClear={() => patch({ productIds: [] })}
              />
            </div>
          ) : (
            <div className={subClass}>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Источник категорий">
                  <select
                    className={fieldClass}
                    value={value.categoryCatalogSource}
                    onChange={(event) =>
                      patch({
                        categoryCatalogSource: event.target
                          .value as BattlePassStepConditionValue["categoryCatalogSource"],
                        categorySelectionIds: [],
                        categorySelectionLabels: [],
                      })
                    }
                  >
                    <option value="LANGAME">Категории Langame</option>
                    <option value="LEETPLUS">Категории LeetPlus</option>
                  </select>
                </Field>
                <Field label="Поиск категории">
                  <input
                    className={fieldClass}
                    value={categoryQuery}
                    onChange={(event) => setCategoryQuery(event.target.value)}
                    placeholder="Введите минимум 3 буквы"
                  />
                </Field>
              </div>
              {loadingGroups ? <Hint>Загружаем категории…</Hint> : null}
              {groupResults.length ? (
                <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto md:grid-cols-2">
                  {groupResults.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950"
                      onClick={() =>
                        patch({
                          categorySelectionIds: [
                            ...value.categorySelectionIds,
                            group.id,
                          ],
                          categorySelectionLabels: [
                            ...value.categorySelectionLabels,
                            { id: group.id, name: group.name },
                          ],
                        })
                      }
                    >
                      <strong className="block">{group.name}</strong>
                      <span className="text-xs text-zinc-500">
                        {group.productCount} товаров · {group.storeCount} клубов
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {categoryWarnings.map((warning) => (
                <Hint key={warning}>{warning}</Hint>
              ))}
              <Chips
                items={value.categorySelectionLabels.map((item) => ({
                  id: item.id,
                  name: item.name,
                }))}
                onRemove={(id) =>
                  patch({
                    categorySelectionIds: value.categorySelectionIds.filter(
                      (item) => item !== id,
                    ),
                    categorySelectionLabels:
                      value.categorySelectionLabels.filter(
                        (item) => item.id !== id,
                      ),
                  })
                }
                onClear={() =>
                  patch({
                    categorySelectionIds: [],
                    categorySelectionLabels: [],
                  })
                }
              />
            </div>
          )}
          <div className={subClass}>
            <NumberField
              label="Окно выполнения, дней"
              value={value.windowDays}
              onChange={(windowDays) => patch({ windowDays })}
            />
          </div>
        </div>
      ) : null}

      {value.taskType === "BALANCE_TOPUP" ? (
        <div className="space-y-3">
          <div className={subClass}>
            <SectionTitle>Сценарий пополнения</SectionTitle>
            <div className="grid gap-3 md:grid-cols-3">
              <button
                type="button"
                className={choiceClass(value.topupMode === "SINGLE")}
                onClick={() => patch({ topupMode: "SINGLE" })}
              >
                <strong>Одно пополнение</strong>
                <span>Одна успешная операция</span>
              </button>
              <button
                type="button"
                className={choiceClass(value.topupMode === "COUNT")}
                onClick={() => patch({ topupMode: "COUNT" })}
              >
                <strong>Несколько пополнений</strong>
                <span>Заданное количество операций</span>
              </button>
              <button
                type="button"
                className={choiceClass(value.topupMode === "PERIOD_TOTAL")}
                onClick={() => patch({ topupMode: "PERIOD_TOTAL" })}
              >
                <strong>Сумма за период</strong>
                <span>Накопить общую сумму</span>
              </button>
            </div>
          </div>
          <div className={subClass}>
            <div className="grid gap-3 md:grid-cols-3">
              {value.topupMode !== "PERIOD_TOTAL" ? (
                <Field label="Как сравнивать сумму">
                  <select
                    className={fieldClass}
                    value={value.topupComparison}
                    onChange={(event) =>
                      patch({
                        topupComparison: event.target
                          .value as BattlePassStepConditionValue["topupComparison"],
                      })
                    }
                  >
                    <option value="AT_LEAST">Не меньше указанной</option>
                    <option value="EXACT">Ровно указанная</option>
                  </select>
                </Field>
              ) : null}
              {value.topupMode !== "PERIOD_TOTAL" ? (
                <NumberField
                  label="Сумма пополнения, ₽"
                  value={value.topupAmount}
                  onChange={(topupAmount) => patch({ topupAmount })}
                />
              ) : (
                <NumberField
                  label="Итоговая сумма, ₽"
                  value={value.totalAmount}
                  onChange={(totalAmount) => patch({ totalAmount })}
                />
              )}
              {value.topupMode === "COUNT" ? (
                <NumberField
                  label="Количество пополнений"
                  value={value.topupCount}
                  onChange={(topupCount) => patch({ topupCount })}
                />
              ) : null}
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            Условие работает внутри домена Langame независимо от конкретного
            клуба
            {selectedDomains.length ? ` (${selectedDomains.join(", ")})` : ""}.
            Пополнение в другом клубе того же домена также выполнит шаг.
          </div>
          <div className={subClass}>
            <NumberField
              label="Окно выполнения, дней"
              value={value.windowDays}
              onChange={(windowDays) => patch({ windowDays })}
            />
          </div>
        </div>
      ) : null}

      {value.taskType === "CHECK_IN" ? (
        <div className="space-y-3">
          <div className={subClass}>
            <SectionTitle>Сценарий чекина</SectionTitle>
            <div className="grid gap-2 md:grid-cols-4">
              {(
                [
                  ["SINGLE", "Один чекин"],
                  ["COUNT", "Несколько"],
                  ["PERIOD", "За период"],
                  ["STREAK", "Дни подряд"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={choiceClass(value.checkInMode === id)}
                  onClick={() => patch({ checkInMode: id })}
                >
                  <strong>{label}</strong>
                </button>
              ))}
            </div>
          </div>
          {value.checkInMode !== "SINGLE" ? (
            <div className={subClass}>
              <NumberField
                label={
                  value.checkInMode === "STREAK"
                    ? "Количество дней подряд"
                    : "Количество чекинов"
                }
                value={
                  value.checkInMode === "STREAK"
                    ? value.checkInDays
                    : value.checkInCount
                }
                onChange={(amount) =>
                  patch(
                    value.checkInMode === "STREAK"
                      ? { checkInDays: amount }
                      : { checkInCount: amount },
                  )
                }
              />
            </div>
          ) : null}
          <div className={subClass}>
            <div className="grid gap-3 md:grid-cols-2">
              <Toggle
                label="Только в конкретные дни"
                checked={value.specificDayEnabled}
                onChange={(specificDayEnabled) => patch({ specificDayEnabled })}
              />
              <Toggle
                label="Только в конкретное время"
                checked={value.specificTimeEnabled}
                onChange={(specificTimeEnabled) =>
                  patch({ specificTimeEnabled })
                }
              />
            </div>
            {value.specificDayEnabled ? (
              <Weekdays
                value={value.weekdays}
                onChange={(weekdays) => patch({ weekdays })}
              />
            ) : null}
            {value.specificTimeEnabled ? (
              <input
                className={`${fieldClass} mt-3`}
                value={value.hours}
                onChange={(event) => patch({ hours: event.target.value })}
                placeholder="09:00-21:00"
              />
            ) : null}
          </div>
          <div className={subClass}>
            <NumberField
              label="Окно выполнения, дней"
              value={value.windowDays}
              onChange={(windowDays) => patch({ windowDays })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleFields({
  value,
  patch,
}: {
  value: BattlePassStepConditionValue;
  patch: (value: Partial<BattlePassStepConditionValue>) => void;
}) {
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      <Field label="Окна времени">
        <input
          className={fieldClass}
          value={value.hours}
          onChange={(event) => patch({ hours: event.target.value })}
          placeholder="09:00-21:00"
        />
      </Field>
      <NumberField
        label="Окно выполнения, дней"
        value={value.windowDays}
        onChange={(windowDays) => patch({ windowDays })}
      />
      <div>
        <span className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Дни недели
        </span>
        <Weekdays
          value={value.weekdays}
          onChange={(weekdays) => patch({ weekdays })}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        {label}
      </span>
      {children}
    </label>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
      {children}
    </p>
  );
}
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        className={fieldClass}
        type="number"
        min="0"
        value={value}
        onChange={(event) =>
          onChange(Math.max(0, Number(event.target.value) || 0))
        }
      />
    </Field>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-950">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
function Weekdays({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {weekdayOptions.map(([id, label]) => {
        const active = value.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={`rounded-md border px-2 py-1 text-xs font-bold ${active ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950"}`}
            onClick={() =>
              onChange(
                active ? value.filter((item) => item !== id) : [...value, id],
              )
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
function Chips({
  items,
  onRemove,
  onClear,
}: {
  items: Array<{ id: string; name: string }>;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (!items.length) return <Hint>Пока ничего не выбрано.</Hint>;
  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-white/70 p-3 dark:border-emerald-900 dark:bg-zinc-950">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item.id}
            className="group inline-flex items-center gap-2 rounded-md border border-emerald-300 px-2 py-1 text-xs"
          >
            <span>{item.name}</span>
            <button
              type="button"
              className="font-black text-zinc-400 hover:text-red-600"
              aria-label={`Удалить ${item.name}`}
              onClick={() => onRemove(item.id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 text-xs font-semibold text-red-600 hover:underline"
        onClick={onClear}
      >
        Очистить список
      </button>
    </div>
  );
}
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
      {children}
    </p>
  );
}
function choiceClass(active: boolean) {
  return `flex min-h-14 flex-col justify-center rounded-lg border px-3 py-2 text-left text-xs transition ${active ? "border-emerald-400 bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100" : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"} [&>span]:mt-0.5 [&>span]:text-[11px] [&>span]:font-normal`;
}

"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getRoleLabel } from "@/lib/roles";
import type {
  StaffSalaryPeriod,
  StaffSalaryPeriodType,
  StaffSalaryRoleScope,
  StaffSalaryScheme,
  StaffSalarySchemeStatus,
  StaffSalaryWorkspace,
  StaffSalaryProductSaleBonusRule,
} from "@/lib/staff-salary";

type Props = {
  workspace: StaffSalaryWorkspace;
};

const statusLabels: Record<StaffSalarySchemeStatus, string> = {
  DRAFT: "Черновик",
  ACTIVE: "Активна",
  ARCHIVED: "Архив",
};

const periodLabels: Record<StaffSalaryPeriodType, string> = {
  MONTHLY: "Месяц",
  BIWEEKLY: "2 недели",
  WEEKLY: "Неделя",
  CUSTOM: "Произвольный период",
};

const roleScopeLabels: Record<StaffSalaryRoleScope, string> = {
  ADMINISTRATOR: "Все администраторы",
  SENIOR_ADMINISTRATOR: "Старшие администраторы",
  CLUB_ADMINISTRATOR: "Администраторы клубов",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatMoney(value: number) {
  return `${formatNumber(Math.round(value))} руб`;
}

function formatHours(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
    value,
  )} ч`;
}

function numberValue(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

function createProductBonusDrafts(
  rules: StaffSalaryProductSaleBonusRule[] | undefined,
) {
  const rows = (rules ?? []).map((rule, index) => ({
    id: `${rule.productId}-${index}`,
    productId: rule.productId,
    amount: numberValue(rule.amount),
  }));

  return rows.length > 0
    ? rows
    : [{ id: "product-bonus-new", productId: "", amount: "0" }];
}

export function StaffSalaryWorkspaceView({ workspace }: Props) {
  const router = useRouter();
  const [selectedScheme, setSelectedScheme] =
    useState<StaffSalaryScheme | null>(workspace.schemes[0] ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [productBonusRows, setProductBonusRows] = useState(() =>
    createProductBonusDrafts(workspace.schemes[0]?.bonusRules.productSaleBonuses),
  );

  const [showCalculationForm, setShowCalculationForm] = useState(false);
  const [periodMode, setPeriodMode] = useState<"MONTH" | "CUSTOM">("MONTH");
  const [expandedPeriodId, setExpandedPeriodId] = useState<string | null>(
    workspace.periods[0]?.id ?? null,
  );
  const [periodMessage, setPeriodMessage] = useState<string | null>(null);
  const [periodSaving, setPeriodSaving] = useState(false);


  async function handleCreatePeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPeriodSaving(true);
    setPeriodMessage(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      calculate: "1",
      periodMode: String(form.get("periodMode") ?? "MONTH"),
      month: String(form.get("month") ?? ""),
      dateFrom: String(form.get("dateFrom") ?? ""),
      dateTo: String(form.get("dateTo") ?? ""),
      storeIds: form.getAll("storeIds").map((value) => String(value)),
      roleScope: String(form.get("roleScope") ?? "ADMINISTRATOR"),
      userIds: form.getAll("userIds").map((value) => String(value)),
    };

    try {
      const response = await fetch("/api/staff/salary/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setPeriodMessage(data?.message ?? "Не удалось сформировать период");
        return;
      }

      const period = (await response.json()) as StaffSalaryPeriod;
      setExpandedPeriodId(period.id);
      setShowCalculationForm(false);
      setPeriodMessage("Период сформирован");
      router.refresh();
    } finally {
      setPeriodSaving(false);
    }
  }

  async function handleAdjustmentSubmit(
    event: FormEvent<HTMLFormElement>,
    periodId: string,
    userId: string,
  ) {
    event.preventDefault();
    setPeriodMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      "/api/staff/salary/periods/" +
        encodeURIComponent(periodId) +
        "/rows/" +
        encodeURIComponent(userId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftCount: String(form.get("shiftCount") ?? ""),
          bonusAmount: String(form.get("bonusAmount") ?? "0"),
          penaltyAmount: String(form.get("penaltyAmount") ?? "0"),
          comment: String(form.get("comment") ?? ""),
        }),
      },
    );

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setPeriodMessage(data?.message ?? "Не удалось сохранить корректировку");
      return;
    }

    setPeriodMessage("Корректировка сохранена");
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const productBonusProductIds = form
      .getAll("productSaleBonusProductId")
      .map((value) => String(value));
    const productBonusAmounts = form
      .getAll("productSaleBonusAmount")
      .map((value) => String(value));
    const productSaleBonuses = productBonusProductIds
      .map((productId, index) => ({
        productId,
        amount: productBonusAmounts[index] ?? "0",
      }))
      .filter((row) => row.productId && Number(row.amount) > 0);
    const payload = {
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      storeId: String(form.get("storeId") ?? "") || null,
      status: String(form.get("status") ?? "ACTIVE"),
      roleScope: String(form.get("roleScope") ?? "ADMINISTRATOR"),
      periodType: String(form.get("periodType") ?? "MONTHLY"),
      fixedAmount: String(form.get("fixedAmount") ?? "0"),
      hourlyRate: String(form.get("hourlyRate") ?? "0"),
      shiftRate: String(form.get("shiftRate") ?? "0"),
      bonusRules: {
        taskDoneOnTimeAmount: String(form.get("taskDoneOnTimeAmount") ?? "0"),
        acceptedChecklistAmount: String(
          form.get("acceptedChecklistAmount") ?? "0",
        ),
        perfectChecklistAmount: String(
          form.get("perfectChecklistAmount") ?? "0",
        ),
        noViolationAmount: String(form.get("noViolationAmount") ?? "0"),
        barRevenuePercent: String(form.get("barRevenuePercent") ?? "0"),
        productSaleBonuses,
      },
      penaltyRules: {
        overdueTaskAmount: String(form.get("overdueTaskAmount") ?? "0"),
        returnedChecklistAmount: String(
          form.get("returnedChecklistAmount") ?? "0",
        ),
        failedChecklistItemAmount: String(
          form.get("failedChecklistItemAmount") ?? "0",
        ),
        warningAmount: String(form.get("warningAmount") ?? "0"),
        includeDisciplineFines: form.get("includeDisciplineFines") === "on",
      },
    };
    const url = selectedScheme
      ? `/api/staff/salary/schemes/${encodeURIComponent(selectedScheme.id)}`
      : "/api/staff/salary/schemes";
    const response = await fetch(url, {
      method: selectedScheme ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setMessage(data?.message ?? "Не удалось сохранить правила расчета");
      return;
    }

    setMessage("Правила расчета сохранены");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      <SalaryPeriodsPanel
        expandedPeriodId={expandedPeriodId}
        onAdjustmentSubmit={handleAdjustmentSubmit}
        onCreatePeriod={handleCreatePeriod}
        onToggleExpanded={setExpandedPeriodId}
        periodMessage={periodMessage}
        periodMode={periodMode}
        periodSaving={periodSaving}
        setPeriodMode={setPeriodMode}
        setShowCalculationForm={setShowCalculationForm}
        showCalculationForm={showCalculationForm}
        workspace={workspace}
      />

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Конструктор
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                Правила расчета зарплаты
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedScheme(null);
                setProductBonusRows(createProductBonusDrafts(undefined));
                setMessage(null);
              }}
              className="h-10 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Новые правила
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {workspace.schemes.length > 0 ? (
              workspace.schemes.map((scheme) => (
                <button
                  key={scheme.id}
                  type="button"
                  onClick={() => {
                    setSelectedScheme(scheme);
                    setProductBonusRows(
                      createProductBonusDrafts(
                        scheme.bonusRules.productSaleBonuses,
                      ),
                    );
                    setMessage(null);
                  }}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition",
                    selectedScheme?.id === scheme.id
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-zinc-200 hover:border-emerald-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{scheme.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {scheme.store?.name ?? "Вся сеть"} ·{" "}
                        {periodLabels[scheme.periodType]} ·{" "}
                        {roleScopeLabels[scheme.roleScope]}
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                      {statusLabels[scheme.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    Оклад {formatMoney(scheme.fixedAmount)}, смена{" "}
                    {formatMoney(scheme.shiftRate)}, час{" "}
                    {formatMoney(scheme.hourlyRate)}
                  </p>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
                Правил пока нет. Создайте первые правила для всей сети или
                клуба.
              </div>
            )}
          </div>
        </div>

        <form
          key={selectedScheme?.id ?? "new"}
          onSubmit={handleSubmit}
          className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            {selectedScheme ? "Редактирование" : "Новые правила"}
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            {selectedScheme?.title ?? "Правила расчета зарплаты"}
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Input
              label="Название"
              name="title"
              defaultValue={selectedScheme?.title ?? ""}
              required
            />
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Клуб
              </span>
              <select
                name="storeId"
                defaultValue={selectedScheme?.storeId ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Вся сеть</option>
                {workspace.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Статус
              </span>
              <select
                name="status"
                defaultValue={selectedScheme?.status ?? "ACTIVE"}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Период
              </span>
              <select
                name="periodType"
                defaultValue={selectedScheme?.periodType ?? "MONTHLY"}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(periodLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Роль
              </span>
              <select
                name="roleScope"
                defaultValue={selectedScheme?.roleScope ?? "ADMINISTRATOR"}
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(roleScopeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Заметка
              </span>
              <textarea
                name="description"
                defaultValue={selectedScheme?.description ?? ""}
                rows={3}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <Input
              label="Оклад за период, руб"
              name="fixedAmount"
              type="number"
              defaultValue={numberValue(selectedScheme?.fixedAmount ?? 0)}
            />
            <Input
              label="Ставка за смену, руб"
              name="shiftRate"
              type="number"
              defaultValue={numberValue(selectedScheme?.shiftRate ?? 0)}
            />
            <Input
              label="Ставка за час, руб"
              name="hourlyRate"
              type="number"
              defaultValue={numberValue(selectedScheme?.hourlyRate ?? 0)}
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <RuleBox title="Премии">
              <Input
                label="Задача вовремя"
                name="taskDoneOnTimeAmount"
                type="number"
                defaultValue={numberValue(
                  selectedScheme?.bonusRules.taskDoneOnTimeAmount ?? 0,
                )}
              />
              <Input
                label="Принятый чек-лист"
                name="acceptedChecklistAmount"
                type="number"
                defaultValue={numberValue(
                  selectedScheme?.bonusRules.acceptedChecklistAmount ?? 0,
                )}
              />
              <Input
                label="Идеальные чек-листы"
                name="perfectChecklistAmount"
                type="number"
                defaultValue={numberValue(
                  selectedScheme?.bonusRules.perfectChecklistAmount ?? 0,
                )}
              />
              <Input
                label="Без нарушений"
                name="noViolationAmount"
                type="number"
                defaultValue={numberValue(
                  selectedScheme?.bonusRules.noViolationAmount ?? 0,
                )}
              />
              <Input
                label="% от выручки бара"
                name="barRevenuePercent"
                type="number"
                defaultValue={numberValue(
                  selectedScheme?.bonusRules.barRevenuePercent ?? 0,
                )}
              />
              <div className="sm:col-span-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Бонусы за товары</p>
                  <button
                    type="button"
                    onClick={() =>
                      setProductBonusRows((rows) => [
                        ...rows,
                        {
                          id: `product-bonus-${Date.now()}`,
                          productId: "",
                          amount: "0",
                        },
                      ])
                    }
                    className="h-8 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Добавить товар
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {productBonusRows.map((row) => (
                    <div
                      key={row.id}
                      className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_36px]"
                    >
                      <select
                        name="productSaleBonusProductId"
                        value={row.productId}
                        onChange={(event) => {
                          const value = event.target.value;
                          setProductBonusRows((rows) =>
                            rows.map((item) =>
                              item.id === row.id
                                ? { ...item, productId: value }
                                : item,
                            ),
                          );
                        }}
                        className="h-10 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        <option value="">Выберите товар</option>
                        {workspace.products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                            {product.categoryName
                              ? ` · ${product.categoryName}`
                              : ""}
                            {product.stores.length > 0
                              ? ` · ${product.stores
                                  .map((store) => store.name)
                                  .join(", ")}`
                              : ""}
                          </option>
                        ))}
                      </select>
                      <input
                        name="productSaleBonusAmount"
                        type="number"
                        min="0"
                        step="1"
                        value={row.amount}
                        onChange={(event) => {
                          const value = event.target.value;
                          setProductBonusRows((rows) =>
                            rows.map((item) =>
                              item.id === row.id
                                ? { ...item, amount: value }
                                : item,
                            ),
                          );
                        }}
                        className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        placeholder="руб/шт"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setProductBonusRows((rows) =>
                            rows.length > 1
                              ? rows.filter((item) => item.id !== row.id)
                              : createProductBonusDrafts(undefined),
                          )
                        }
                        className="h-10 rounded-md border border-zinc-300 text-sm font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        aria-label="Удалить товарный бонус"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </RuleBox>

            <RuleBox title="Удержания">
              <Input
                label="Просроченная задача"
                name="overdueTaskAmount"
                type="number"
                defaultValue={numberValue(
                  selectedScheme?.penaltyRules.overdueTaskAmount ?? 0,
                )}
              />
              <Input
                label="Возврат чек-листа"
                name="returnedChecklistAmount"
                type="number"
                defaultValue={numberValue(
                  selectedScheme?.penaltyRules.returnedChecklistAmount ?? 0,
                )}
              />
              <Input
                label="Проваленный пункт"
                name="failedChecklistItemAmount"
                type="number"
                defaultValue={numberValue(
                  selectedScheme?.penaltyRules.failedChecklistItemAmount ?? 0,
                )}
              />
              <Input
                label="Предупреждение"
                name="warningAmount"
                type="number"
                defaultValue={numberValue(
                  selectedScheme?.penaltyRules.warningAmount ?? 0,
                )}
              />
              <label className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                <input
                  type="checkbox"
                  name="includeDisciplineFines"
                  defaultChecked={
                    selectedScheme?.penaltyRules.includeDisciplineFines ?? true
                  }
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Учитывать суммы штрафов
              </label>
            </RuleBox>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              disabled={saving}
              className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Сохранение..."
                : selectedScheme
                  ? "Сохранить изменения"
                  : "Создать правила"}
            </button>
            {message ? (
              <span className="text-sm text-zinc-500">{message}</span>
            ) : null}
          </div>
        </form>
      </section>


    </div>
  );
}


function SalaryPeriodsPanel({
  expandedPeriodId,
  onAdjustmentSubmit,
  onCreatePeriod,
  onToggleExpanded,
  periodMessage,
  periodMode,
  periodSaving,
  setPeriodMode,
  setShowCalculationForm,
  showCalculationForm,
  workspace,
}: Props & {
  expandedPeriodId: string | null;
  onAdjustmentSubmit: (
    event: FormEvent<HTMLFormElement>,
    periodId: string,
    userId: string,
  ) => void;
  onCreatePeriod: (event: FormEvent<HTMLFormElement>) => void;
  onToggleExpanded: (id: string | null) => void;
  periodMessage: string | null;
  periodMode: "MONTH" | "CUSTOM";
  periodSaving: boolean;
  setPeriodMode: (value: "MONTH" | "CUSTOM") => void;
  setShowCalculationForm: (value: boolean) => void;
  showCalculationForm: boolean;
}) {
  const today = new Date();
  const defaultMonth = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
  ].join("-");

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Расчетные периоды
          </p>
          <h2 className="mt-1 text-xl font-semibold">Зарплата по периодам</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowCalculationForm(!showCalculationForm)}
          className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
        >
          Рассчитать зарплату за период
        </button>
      </div>

      {showCalculationForm ? (
        <form
          onSubmit={onCreatePeriod}
          className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Расчет
              </span>
              <select
                name="periodMode"
                value={periodMode}
                onChange={(event) =>
                  setPeriodMode(event.target.value as "MONTH" | "CUSTOM")
                }
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="MONTH">За месяц</option>
                <option value="CUSTOM">За период</option>
              </select>
            </label>

            {periodMode === "MONTH" ? (
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Месяц
                </span>
                <input
                  type="month"
                  name="month"
                  defaultValue={workspace.filters.month || defaultMonth}
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
            ) : (
              <>
                <label className="block text-sm">
                  <span className="text-xs font-semibold uppercase text-zinc-500">
                    С даты
                  </span>
                  <input
                    type="date"
                    name="dateFrom"
                    defaultValue={workspace.filters.dateFrom}
                    className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-semibold uppercase text-zinc-500">
                    По дату
                  </span>
                  <input
                    type="date"
                    name="dateTo"
                    defaultValue={workspace.filters.dateTo}
                    className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
              </>
            )}

            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Роль
              </span>
              <select
                name="roleScope"
                defaultValue="ADMINISTRATOR"
                className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(roleScopeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <fieldset className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <legend className="px-1 text-xs font-semibold uppercase text-zinc-500">
                Клубы
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {workspace.stores.map((store) => (
                  <label key={store.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="storeIds"
                      value={store.id}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    <span>{store.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <legend className="px-1 text-xs font-semibold uppercase text-zinc-500">
                Сотрудники
              </legend>
              <div className="mt-2 max-h-56 space-y-2 overflow-auto pr-2">
                {workspace.users.map((user) => (
                  <label key={user.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="userIds"
                      value={user.id}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                    />
                    <span>
                      <span className="block font-medium">
                        {user.fullName ?? user.email}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {getRoleLabel(user.role)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              disabled={periodSaving}
              className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-zinc-950"
            >
              {periodSaving ? "Расчет..." : "Сформировать период"}
            </button>
            {periodMessage ? (
              <span className="text-sm text-zinc-500">{periodMessage}</span>
            ) : null}
          </div>
        </form>
      ) : periodMessage ? (
        <p className="mt-3 text-sm text-zinc-500">{periodMessage}</p>
      ) : null}

      <div className="mt-4 space-y-2">
        {workspace.periods.map((period) => (
          <div
            key={period.id}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800"
          >
            <button
              type="button"
              onClick={() =>
                onToggleExpanded(
                  expandedPeriodId === period.id ? null : period.id,
                )
              }
              className="grid w-full gap-3 p-4 text-left md:grid-cols-[minmax(0,1fr)_140px_170px]"
            >
              <div>
                <p className="font-semibold">{period.title}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {period.dateFrom} - {period.dateTo}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">
                  Сотрудников
                </p>
                <p className="mt-1 font-semibold">
                  {formatNumber(period.totalEmployees)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">
                  Общая сумма
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {formatMoney(period.totalNetAmount)}
                </p>
              </div>
            </button>

            {expandedPeriodId === period.id ? (
              <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-zinc-500">
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        <th className="py-2 pr-4">Сотрудник</th>
                        <th className="py-2 pr-4">Калькулятор</th>
                        <th className="py-2 pr-4">Премии</th>
                        <th className="py-2 pr-4">Удержания</th>
                        <th className="py-2 pr-4">Итог</th>
                        <th className="py-2 pr-4">Корректировка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {period.rows.map((row) => {
                        const shiftRate = row.scheme?.shiftRate ?? 0;
                        const hourlyRate = row.scheme?.hourlyRate ?? 0;
                        const visibleStores =
                          row.shiftStores.length > 0
                            ? row.shiftStores
                            : row.user.stores;
                        const storeLabel =
                          visibleStores.length > 0
                            ? visibleStores.map((store) => store.name).join(", ")
                            : "вся сеть";

                        return (
                          <tr
                            key={row.id}
                            className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900"
                          >
                            <td className="min-w-56 py-3 pr-4">
                              <p className="font-semibold">
                                {row.user.fullName ?? row.user.email}
                              </p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {getRoleLabel(row.user.role)}
                              </p>
                              <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                                {storeLabel}
                              </p>
                            </td>
                            <td className="min-w-64 py-3 pr-4 text-xs text-zinc-600 dark:text-zinc-300">
                              <p>Оклад: {formatMoney(row.baseAmount)}</p>
                              <p>
                                Смены: {formatNumber(row.shifts)} x{" "}
                                {formatMoney(shiftRate)} ={" "}
                                {formatMoney(row.shiftAmount)}
                              </p>
                              <p>
                                Часы: {formatHours(row.hours)} x{" "}
                                {formatMoney(hourlyRate)} ={" "}
                                {formatMoney(row.hourlyAmount)}
                              </p>
                              {row.originalShifts !== undefined &&
                              row.originalShifts !== row.shifts ? (
                                <p className="text-amber-600">
                                  исходно: {formatNumber(row.originalShifts)} смен
                                </p>
                              ) : null}
                            </td>
                            <td className="py-3 pr-4">
                              <p className="font-semibold text-emerald-600">
                                {formatMoney(row.bonusAmount)}
                              </p>
                              {row.manualAdjustment?.bonusAmount ? (
                                <p className="mt-1 text-xs text-zinc-500">
                                  вручную:{" "}
                                  {formatMoney(row.manualAdjustment.bonusAmount)}
                                </p>
                              ) : null}
                            </td>
                            <td className="py-3 pr-4">
                              <p className="font-semibold text-red-500">
                                {formatMoney(row.penaltyAmount)}
                              </p>
                              {row.manualAdjustment?.penaltyAmount ? (
                                <p className="mt-1 text-xs text-zinc-500">
                                  вручную:{" "}
                                  {formatMoney(row.manualAdjustment.penaltyAmount)}
                                </p>
                              ) : null}
                            </td>
                            <td className="py-3 pr-4">
                              <p className="text-lg font-semibold">
                                {formatMoney(row.netAmount)}
                              </p>
                            </td>
                            <td className="min-w-72 py-3 pr-4">
                              <form
                                onSubmit={(event) =>
                                  onAdjustmentSubmit(event, period.id, row.id)
                                }
                                className="grid gap-2"
                              >
                                <div className="grid grid-cols-3 gap-2">
                                  <label className="text-xs font-semibold uppercase text-zinc-500">
                                    Смены
                                    <input
                                      name="shiftCount"
                                      type="number"
                                      min="0"
                                      step="1"
                                      defaultValue={numberValue(row.shifts)}
                                      className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs font-normal normal-case text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                    />
                                  </label>
                                  <label className="text-xs font-semibold uppercase text-zinc-500">
                                    Премия
                                    <input
                                      name="bonusAmount"
                                      type="number"
                                      min="0"
                                      step="1"
                                      defaultValue={
                                        row.manualAdjustment?.bonusAmount ?? 0
                                      }
                                      className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs font-normal normal-case text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                    />
                                  </label>
                                  <label className="text-xs font-semibold uppercase text-zinc-500">
                                    Штраф
                                    <input
                                      name="penaltyAmount"
                                      type="number"
                                      min="0"
                                      step="1"
                                      defaultValue={
                                        row.manualAdjustment?.penaltyAmount ?? 0
                                      }
                                      className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs font-normal normal-case text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                                    />
                                  </label>
                                </div>
                                <input
                                  name="comment"
                                  defaultValue={row.manualAdjustment?.comment ?? ""}
                                  className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                                  placeholder="Комментарий"
                                />
                                <button className="h-9 rounded-md border border-zinc-300 text-xs font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
                                  Применить
                                </button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ))}

        {workspace.periods.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
            Расчетных периодов пока нет.
          </div>
        ) : null}
      </div>
    </section>
  );
}


function Input({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold uppercase text-zinc-500">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "1" : undefined}
        className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}

function RuleBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

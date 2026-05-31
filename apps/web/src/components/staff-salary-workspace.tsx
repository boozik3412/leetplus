"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getRoleLabel } from "@/lib/roles";
import type {
  StaffSalaryPeriodType,
  StaffSalaryRoleScope,
  StaffSalaryScheme,
  StaffSalarySchemeStatus,
  StaffSalaryWorkspace,
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

export function StaffSalaryWorkspaceView({ workspace }: Props) {
  const router = useRouter();
  const [selectedScheme, setSelectedScheme] = useState<StaffSalaryScheme | null>(
    workspace.schemes[0] ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const cards = useMemo(
    () =>
      [
        {
          label: "К выплате",
          value: formatMoney(workspace.summary.totalNetAmount),
        },
        {
          label: "Оклад",
          value: formatMoney(workspace.summary.totalBaseAmount),
        },
        {
          label: "Премии",
          value: formatMoney(workspace.summary.totalBonusAmount),
        },
        {
          label: "Удержания",
          value: formatMoney(workspace.summary.totalPenaltyAmount),
        },
        {
          label: "Смены",
          value: formatNumber(workspace.summary.shifts),
        },
        {
          label: "Часы",
          value: formatHours(workspace.summary.hours),
        },
      ] as const,
    [workspace.summary],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      storeId: String(form.get("storeId") ?? "") || null,
      status: String(form.get("status") ?? "DRAFT"),
      roleScope: String(form.get("roleScope") ?? "ADMINISTRATOR"),
      periodType: String(form.get("periodType") ?? "MONTHLY"),
      fixedAmount: String(form.get("fixedAmount") ?? "0"),
      hourlyRate: String(form.get("hourlyRate") ?? "0"),
      shiftRate: String(form.get("shiftRate") ?? "0"),
      bonusRules: {
        taskDoneOnTimeAmount: String(
          form.get("taskDoneOnTimeAmount") ?? "0",
        ),
        acceptedChecklistAmount: String(
          form.get("acceptedChecklistAmount") ?? "0",
        ),
        perfectChecklistAmount: String(
          form.get("perfectChecklistAmount") ?? "0",
        ),
        noViolationAmount: String(form.get("noViolationAmount") ?? "0"),
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
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setMessage(data?.message ?? "Не удалось сохранить схему");
      return;
    }

    setMessage("Схема сохранена");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="text-xs font-bold uppercase text-zinc-500">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Конструктор
              </p>
              <h2 className="mt-1 text-xl font-semibold">Схемы зарплаты</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedScheme(null);
                setMessage(null);
              }}
              className="h-10 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Новая схема
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
                Схем пока нет. Создайте первую схему для всей сети или клуба.
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
            {selectedScheme ? "Редактирование" : "Новая схема"}
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            {selectedScheme?.title ?? "Схема начислений администратора"}
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
                defaultValue={selectedScheme?.status ?? "DRAFT"}
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
                  : "Создать схему"}
            </button>
            {message ? (
              <span className="text-sm text-zinc-500">{message}</span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Расчет
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Зарплата администраторов
            </h2>
          </div>
          <p className="max-w-2xl text-sm text-zinc-500">
            Расчет собирает оклад, смены, часы, премии, просрочки,
            чек-листы, предупреждения и штрафы за выбранный период.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-2 pr-4">Сотрудник</th>
                <th className="py-2 pr-4">Схема</th>
                <th className="py-2 pr-4">Смены</th>
                <th className="py-2 pr-4">Основа</th>
                <th className="py-2 pr-4">Премии</th>
                <th className="py-2 pr-4">Удержания</th>
                <th className="py-2 pr-4">К выплате</th>
              </tr>
            </thead>
            <tbody>
              {workspace.rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900"
                >
                  <td className="py-3 pr-4">
                    <p className="font-semibold">
                      {row.user.fullName ?? row.user.email}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {getRoleLabel(row.user.role)} ·{" "}
                      {row.user.stores.length > 0
                        ? row.user.stores.map((store) => store.name).join(", ")
                        : "вся сеть"}
                    </p>
                    {row.sourceWarnings.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {row.sourceWarnings.map((warning) => (
                          <p key={warning} className="text-xs text-amber-600">
                            {warning}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">
                    {row.scheme ? (
                      <>
                        <p className="font-medium">{row.scheme.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {row.scheme.store?.name ?? "Вся сеть"}
                        </p>
                      </>
                    ) : (
                      <span className="text-zinc-500">Не выбрана</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <p>{formatNumber(row.shifts)} смен</p>
                    <p className="text-xs text-zinc-500">
                      {formatHours(row.hours)}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <p>{formatMoney(row.baseAmount)}</p>
                    <p className="text-xs text-zinc-500">
                      смены {formatMoney(row.shiftAmount)}, часы{" "}
                      {formatMoney(row.hourlyAmount)}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <p className="text-emerald-600">
                      {formatMoney(row.bonusAmount)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      задач вовремя {row.tasks.completedOnTime}, чек-листов{" "}
                      {row.checklists.accepted}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <p className="text-red-500">
                      {formatMoney(row.penaltyAmount)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      просрочек {row.tasks.overdue}, штрафов {row.discipline.fines}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <p className="text-lg font-semibold">
                      {formatMoney(row.netAmount)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {workspace.rows.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
            Администраторы по выбранным фильтрам не найдены.
          </div>
        ) : null}
      </section>
    </div>
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

function RuleBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

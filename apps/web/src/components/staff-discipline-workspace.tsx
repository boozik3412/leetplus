"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  type StaffDisciplinePolicy,
  type StaffDisciplineRecord,
  type StaffDisciplineReport,
  type StaffDisciplineRule,
} from "@/lib/staff-discipline";

const levelLabels: Record<StaffDisciplineRecord["level"], string> = {
  WARNING_1: "1 предупреждение",
  WARNING_2: "2 предупреждение",
  FINE_1: "1 штраф",
  FINE_2: "2 штраф",
  FINE_3: "3 штраф и далее",
};

const statusLabels: Record<StaffDisciplineRecord["status"], string> = {
  ACTIVE: "Активно",
  CANCELED: "Отменено",
  RESET: "Сброшено",
};

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(value))} руб`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function StaffDisciplineWorkspace({
  report,
}: {
  report: StaffDisciplineReport;
}) {
  const router = useRouter();
  const canManage = report.access.canManage;
  const activeRules = report.rules.filter((rule) => rule.isActive);
  const [ruleId, setRuleId] = useState(activeRules[0]?.id ?? "");
  const [userId, setUserId] = useState(report.users[0]?.id ?? "");
  const [storeId, setStoreId] = useState(report.stores[0]?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(today());
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rulesByCategory = useMemo(() => groupRules(report.rules), [report.rules]);

  async function togglePolicy(policy: StaffDisciplinePolicy) {
    if (!canManage) {
      return;
    }

    setError(null);
    const response = await fetch("/api/staff/discipline/policy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: policy.storeId,
        enabled: !policy.enabled,
      }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(data?.message ?? "Не удалось обновить включение системы");
      return;
    }

    router.refresh();
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setError(null);
    setIsSaving(true);

    const response = await fetch("/api/staff/discipline/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ruleId,
        userId,
        storeId: storeId || null,
        occurredAt,
        comment: comment || null,
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(data?.message ?? "Не удалось добавить запись");
      return;
    }

    setComment("");
    router.refresh();
  }

  async function updateRecordStatus(
    record: StaffDisciplineRecord,
    status: StaffDisciplineRecord["status"],
  ) {
    if (!canManage) {
      return;
    }

    setError(null);
    const response = await fetch(
      `/api/staff/discipline/records/${encodeURIComponent(record.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setError(data?.message ?? "Не удалось обновить запись");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {!canManage ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/70 dark:bg-emerald-500/10">
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            Личная мотивация
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            Только ваши предупреждения и штрафы
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            В этом режиме показаны записи, оформленные именно на вашу учетную
            запись. Создание, отмена и сброс записей доступны только
            управляющим ролям.
          </p>
        </section>
      ) : null}

      {canManage ? (
        <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-300">
                  Включение
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  Система предупреждений и штрафов
                </h2>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {report.policies.map((policy) => (
                <button
                  key={`${policy.scope}:${policy.storeId ?? "network"}`}
                  type="button"
                  onClick={() => void togglePolicy(policy)}
                  className={[
                    "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition",
                    policy.enabled
                      ? "border-emerald-200 bg-emerald-50/70 hover:border-emerald-400 dark:border-emerald-900/70 dark:bg-emerald-500/10"
                      : "border-zinc-200 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/70",
                  ].join(" ")}
                >
                  <span>
                    <span className="block text-sm font-semibold">
                      {policy.label}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {policy.inheritedFromNetwork
                        ? "Наследует настройку сети"
                        : policy.scope === "NETWORK"
                          ? "Главная настройка сети"
                          : "Настроено отдельно для клуба"}
                    </span>
                  </span>
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-bold uppercase",
                      policy.enabled
                        ? "bg-emerald-500 text-zinc-950"
                        : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
                    ].join(" ")}
                  >
                    {policy.enabled ? "Вкл" : "Выкл"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(event) => void createRecord(event)}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-300">
              Новая запись
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              Зафиксировать предупреждение или штраф
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block text-sm md:col-span-2">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Нарушение
                </span>
                <select
                  value={ruleId}
                  onChange={(event) => setRuleId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  required
                >
                  {activeRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.category}: {rule.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Администратор
                </span>
                <select
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  required
                >
                  {report.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName ?? user.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Клуб
                </span>
                <select
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="">Вся сеть</option>
                  {report.stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Дата
                </span>
                <input
                  type="date"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  Комментарий
                </span>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  placeholder="Контекст, ссылка на чеклист, смену или замечание управляющего"
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
            </div>
            <button
              disabled={isSaving || !ruleId || !userId}
              className="mt-4 h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Сохраняем..." : "Добавить запись"}
            </button>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Первые две записи в категории становятся предупреждениями. После
              этого штраф считается по выбранному нарушению: первый, второй,
              третий и далее.
            </p>
          </form>
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-300">
                Шаблон из файла
              </p>
              <h2 className="mt-1 text-lg font-semibold">Правила и ставки</h2>
            </div>
            <span className="text-xs font-semibold uppercase text-zinc-500">
              {report.summary.activeRules} активных правил
            </span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {Array.from(rulesByCategory.entries()).map(([category, rules]) => (
              <div
                key={category}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <h3 className="text-sm font-semibold">{category}</h3>
                <div className="mt-3 space-y-2">
                  {rules.map((rule) => (
                    <RuleRow key={rule.id} rule={rule} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-300">
              Журнал
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {canManage ? "Предупреждения и штрафы" : "Мои предупреждения и штрафы"}
            </h2>
          </div>
          <span className="text-xs text-zinc-500">
            {report.summary.recordsTotal} записей за период
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {report.records.length > 0 ? (
            report.records.map((record) => (
              <div
                key={record.id}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {record.user.fullName ?? record.user.email}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {record.category} · {record.ruleTitle} ·{" "}
                      {record.store?.name ?? "вся сеть"} ·{" "}
                      {formatDate(record.occurredAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold dark:bg-zinc-900">
                      {levelLabels[record.level]}
                    </span>
                    {record.amount > 0 ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-200">
                        {formatMoney(record.amount)}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold dark:bg-zinc-900">
                      {statusLabels[record.status]}
                    </span>
                  </div>
                </div>
                {record.comment ? (
                  <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {record.comment}
                  </p>
                ) : null}
                {record.status === "ACTIVE" && canManage ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void updateRecordStatus(record, "CANCELED")}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      Отменить
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateRecordStatus(record, "RESET")}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      Сбросить после аттестации
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
              За выбранный период записей нет.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RuleRow({ rule }: { rule: StaffDisciplineRule }) {
  return (
    <div className="rounded-md bg-zinc-50 p-2 text-xs dark:bg-zinc-900/70">
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">
        {rule.title}
      </p>
      <p className="mt-1 text-zinc-500">
        {formatMoney(rule.firstFineAmount)} /{" "}
        {formatMoney(rule.secondFineAmount)} /{" "}
        {formatMoney(rule.thirdFineAmount)}
      </p>
    </div>
  );
}

function groupRules(rules: StaffDisciplineRule[]) {
  const map = new Map<string, StaffDisciplineRule[]>();

  rules.forEach((rule) => {
    const rows = map.get(rule.category) ?? [];
    rows.push(rule);
    map.set(rule.category, rows);
  });

  return map;
}

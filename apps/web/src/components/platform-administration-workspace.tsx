"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  AdminAuditEvent,
  AdminAuditEventsResponse,
  AdminOverview,
} from "@/lib/admin-overview";

type Tenant = AdminOverview["tenants"][number];
type LangameSource = Tenant["langameSources"][number];
type LifecycleAction = "ACTIVATE" | "SUSPEND" | "ARCHIVE";
type SourceSupportAction = "DISABLE" | "ENABLE" | "MARK_FOR_REVIEW";

type TenantFormState = {
  action: LifecycleAction;
  reason: string;
  confirmation: string;
  supportNote: string;
  supportTicket: string;
  message: string | null;
  error: string | null;
};

type SourceFormState = {
  action: SourceSupportAction;
  reason: string;
  confirmation: string;
  supportTicket: string;
  message: string | null;
  error: string | null;
};

type AuditFilters = {
  tenantId: string;
  actor: string;
  targetType: string;
  dateFrom: string;
  dateTo: string;
  limit: string;
};

const statusLabels: Record<Tenant["status"], string> = {
  ACTIVE: "Активен",
  SUSPENDED: "Приостановлен",
  ARCHIVED: "Архив",
};

const statusClasses: Record<Tenant["status"], string> = {
  ACTIVE:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  SUSPENDED:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  ARCHIVED: "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
};

const severityLabels: Record<Tenant["diagnostics"]["severity"], string> = {
  OK: "OK",
  WARNING: "Внимание",
  CRITICAL: "Критично",
};

const severityClasses: Record<Tenant["diagnostics"]["severity"], string> = {
  OK: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  WARNING: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  CRITICAL: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200",
};

const actionLabels: Record<LifecycleAction, string> = {
  ACTIVATE: "Активировать",
  SUSPEND: "Приостановить",
  ARCHIVE: "Архивировать",
};

const sourceActionLabels: Record<SourceSupportAction, string> = {
  DISABLE: "Отключить источник",
  ENABLE: "Включить источник",
  MARK_FOR_REVIEW: "На перепроверку",
};

const defaultAuditFilters: AuditFilters = {
  tenantId: "",
  actor: "",
  targetType: "",
  dateFrom: "",
  dateTo: "",
  limit: "100",
};

const baseTargetTypeOptions = ["TENANT", "INTEGRATION_SOURCE"];

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function defaultAction(status: Tenant["status"]): LifecycleAction {
  if (status === "ACTIVE") {
    return "SUSPEND";
  }

  return "ACTIVATE";
}

function initialFormState(tenant: Tenant): TenantFormState {
  return {
    action: defaultAction(tenant.status),
    reason: "",
    confirmation: "",
    supportNote: "",
    supportTicket: "",
    message: null,
    error: null,
  };
}

function initialSourceFormState(source: LangameSource): SourceFormState {
  return {
    action: source.isActive ? "MARK_FOR_REVIEW" : "ENABLE",
    reason: "",
    confirmation: "",
    supportTicket: "",
    message: null,
    error: null,
  };
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}

export function PlatformAdministrationWorkspace({
  overview,
}: {
  overview: AdminOverview;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [forms, setForms] = useState<Record<string, TenantFormState>>(() =>
    Object.fromEntries(
      overview.tenants.map((tenant) => [tenant.id, initialFormState(tenant)]),
    ),
  );
  const [sourceForms, setSourceForms] = useState<Record<string, SourceFormState>>(
    () =>
      Object.fromEntries(
        overview.tenants.flatMap((tenant) =>
          tenant.langameSources.map((source) => [
            source.id,
            initialSourceFormState(source),
          ]),
        ),
      ),
  );
  const [auditFilters, setAuditFilters] =
    useState<AuditFilters>(defaultAuditFilters);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>(
    overview.auditEvents,
  );
  const [auditCount, setAuditCount] = useState(overview.auditEvents.length);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const targetTypeOptions = Array.from(
    new Set([
      ...baseTargetTypeOptions,
      ...overview.auditEvents.map((event) => event.targetType),
    ]),
  ).sort();

  const cards = [
    { label: "Сетей", value: overview.totals.tenants },
    { label: "Пользователей", value: overview.totals.users },
    { label: "Клубов", value: overview.totals.stores },
    { label: "Товаров", value: overview.totals.products },
    { label: "Продаж", value: overview.totals.salesFacts },
    { label: "Источников Langame", value: overview.totals.integrationSources },
  ];

  function updateForm(
    tenantId: string,
    patch: Partial<TenantFormState>,
  ): void {
    setForms((current) => ({
      ...current,
      [tenantId]: {
        ...(current[tenantId] ?? {
          action: "SUSPEND",
          reason: "",
          confirmation: "",
          supportNote: "",
          supportTicket: "",
          message: null,
          error: null,
        }),
        ...patch,
      },
    }));
  }

  function updateSourceForm(
    sourceId: string,
    patch: Partial<SourceFormState>,
  ): void {
    setSourceForms((current) => ({
      ...current,
      [sourceId]: {
        ...(current[sourceId] ?? {
          action: "MARK_FOR_REVIEW",
          reason: "",
          confirmation: "",
          supportTicket: "",
          message: null,
          error: null,
        }),
        ...patch,
      },
    }));
  }

  function updateAuditFilter(patch: Partial<AuditFilters>) {
    setAuditFilters((current) => ({
      ...current,
      ...patch,
    }));
  }

  function buildAuditSearchParams() {
    const params = new URLSearchParams();
    const entries = Object.entries(auditFilters) as Array<
      [keyof AuditFilters, string]
    >;

    for (const [key, value] of entries) {
      const normalized = value.trim();

      if (normalized) {
        params.set(key, normalized);
      }
    }

    return params;
  }

  async function loadAuditEvents() {
    setIsAuditLoading(true);
    setAuditError(null);

    const response = await fetch(
      `/api/admin/audit-events?${buildAuditSearchParams().toString()}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      setAuditError(await readError(response));
      setIsAuditLoading(false);
      return;
    }

    const data = (await response.json()) as AdminAuditEventsResponse;
    setAuditEvents(data.events);
    setAuditCount(data.count);
    setIsAuditLoading(false);
  }

  function resetAuditFilters() {
    setAuditFilters(defaultAuditFilters);
    setAuditEvents(overview.auditEvents);
    setAuditCount(overview.auditEvents.length);
    setAuditError(null);
  }

  async function submitLifecycle(tenant: Tenant) {
    const form = forms[tenant.id] ?? initialFormState(tenant);
    updateForm(tenant.id, { error: null, message: null });

    const response = await fetch(`/api/admin/tenants/${tenant.id}/lifecycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: form.action,
        reason: form.reason,
        confirmation: form.confirmation,
        supportTicket: form.supportTicket,
      }),
    });

    if (!response.ok) {
      updateForm(tenant.id, { error: await readError(response) });
      return;
    }

    updateForm(tenant.id, {
      reason: "",
      confirmation: "",
      message: "Действие записано в audit trail.",
    });
    await loadAuditEvents();
    startTransition(() => router.refresh());
  }

  async function submitSupportNote(tenant: Tenant) {
    const form = forms[tenant.id] ?? initialFormState(tenant);
    updateForm(tenant.id, { error: null, message: null });

    const response = await fetch(
      `/api/admin/tenants/${tenant.id}/support-note`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: form.supportNote,
          confirmation: form.confirmation,
          supportTicket: form.supportTicket,
          visibility: "INTERNAL",
        }),
      },
    );

    if (!response.ok) {
      updateForm(tenant.id, { error: await readError(response) });
      return;
    }

    updateForm(tenant.id, {
      supportNote: "",
      confirmation: "",
      message: "Support-заметка добавлена в audit trail.",
    });
    await loadAuditEvents();
    startTransition(() => router.refresh());
  }

  async function submitSourceAction(tenant: Tenant, source: LangameSource) {
    const form = sourceForms[source.id] ?? initialSourceFormState(source);
    updateSourceForm(source.id, { error: null, message: null });

    const response = await fetch(
      `/api/admin/integration-sources/${source.id}/support-action`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: form.action,
          reason: form.reason,
          confirmation: form.confirmation,
          supportTicket: form.supportTicket,
        }),
      },
    );

    if (!response.ok) {
      updateSourceForm(source.id, { error: await readError(response) });
      return;
    }

    updateSourceForm(source.id, {
      reason: "",
      confirmation: "",
      message: "Действие по источнику записано в audit trail.",
    });
    await loadAuditEvents();
    startTransition(() => router.refresh());
  }

  const auditExportHref = `/api/admin/audit-events/export?${buildAuditSearchParams().toString()}`;

  return (
    <main className="px-4 py-6 text-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            LeetPlus control plane
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Администрирование
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Контур администратора платформы: состояние tenant-сетей,
            диагностика, lifecycle-действия, support-заметки и audit trail.
          </p>
        </div>

        <section
          id="overview"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
        >
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {formatNumber(card.value)}
              </p>
            </div>
          ))}
        </section>

        <section
          id="diagnostics"
          className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Диагностика
              </p>
              <h2 className="mt-1 text-base font-semibold">
                Состояние платформы
              </h2>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-700 dark:text-red-200">
                Критично: {formatNumber(overview.totals.criticalTenants)}
              </span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-700 dark:text-amber-200">
                Внимание: {formatNumber(overview.totals.warningTenants)}
              </span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overview.tenants.map((tenant) => (
              <div
                key={tenant.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{tenant.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{tenant.slug}</p>
                  </div>
                  <span
                    className={[
                      "rounded-full border px-2.5 py-1 text-xs font-semibold",
                      severityClasses[tenant.diagnostics.severity],
                    ].join(" ")}
                  >
                    {severityLabels[tenant.diagnostics.severity]}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase text-zinc-500">
                      Langame
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {tenant.diagnostics.activeLangameSources} активн.
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-zinc-500">Sync</dt>
                    <dd className="font-semibold">
                      {tenant.diagnostics.lastSyncStatus ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-zinc-500">
                      Ошибки 24ч
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {formatNumber(tenant.diagnostics.failedSyncJobs24h)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-zinc-500">
                      Последний sync
                    </dt>
                    <dd className="font-semibold">
                      {formatDate(tenant.diagnostics.lastSyncAt)}
                    </dd>
                  </div>
                </dl>
                {tenant.diagnostics.issues.length > 0 ? (
                  <ul className="mt-4 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {tenant.diagnostics.issues.map((issue) => (
                      <li key={issue}>• {issue}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-zinc-500">
                    Критичных сигналов нет.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section
          id="tenants"
          className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 pb-4 dark:border-zinc-800">
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Сети
            </p>
            <h2 className="mt-1 text-base font-semibold">Сети tenant</h2>
          </div>
          <div className="mt-4 space-y-4">
            {overview.tenants.map((tenant) => {
              const form = forms[tenant.id] ?? initialFormState(tenant);

              return (
                <article
                  key={tenant.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">
                          {tenant.name}
                        </h3>
                        <span
                          className={[
                            "rounded-full border px-2.5 py-1 text-xs font-semibold",
                            statusClasses[tenant.status],
                          ].join(" ")}
                        >
                          {statusLabels[tenant.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-500">
                        {tenant.slug}
                      </p>
                    </div>
                    <dl className="grid min-w-[320px] grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-xs uppercase text-zinc-500">
                          Users
                        </dt>
                        <dd className="font-semibold tabular-nums">
                          {formatNumber(tenant.usersCount)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-zinc-500">
                          Stores
                        </dt>
                        <dd className="font-semibold tabular-nums">
                          {formatNumber(tenant.storesCount)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-zinc-500">
                          Products
                        </dt>
                        <dd className="font-semibold tabular-nums">
                          {formatNumber(tenant.productsCount)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-zinc-500">
                          Sales
                        </dt>
                        <dd className="font-semibold tabular-nums">
                          {formatNumber(tenant.salesFactsCount)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_420px]">
                    <div className="space-y-3 text-sm">
                      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                        <p className="text-xs font-semibold uppercase text-zinc-500">
                          Langame источники
                        </p>
                        <div className="mt-3 space-y-3">
                          {tenant.langameSources.length > 0 ? (
                            tenant.langameSources.map((source) => {
                              const sourceForm =
                                sourceForms[source.id] ??
                                initialSourceFormState(source);

                              return (
                                <div
                                  key={source.id}
                                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="font-semibold">
                                        {source.domain}
                                      </p>
                                      <p className="mt-1 text-xs text-zinc-500">
                                        {source.isActive ? "on" : "off"} · sync{" "}
                                        {formatDate(source.lastSyncedAt)}
                                      </p>
                                    </div>
                                    {source.supportReviewRequestedAt ? (
                                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200">
                                        На перепроверке
                                      </span>
                                    ) : null}
                                  </div>
                                  {source.supportDisabledReason ||
                                  source.supportReviewReason ? (
                                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                                      {source.supportDisabledReason ??
                                        source.supportReviewReason}
                                    </p>
                                  ) : null}
                                  <div className="mt-3 grid gap-2 md:grid-cols-[160px_1fr_160px_140px]">
                                    <select
                                      value={sourceForm.action}
                                      onChange={(event) =>
                                        updateSourceForm(source.id, {
                                          action: event.target
                                            .value as SourceSupportAction,
                                          error: null,
                                          message: null,
                                        })
                                      }
                                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                                    >
                                      {(
                                        [
                                          "DISABLE",
                                          "ENABLE",
                                          "MARK_FOR_REVIEW",
                                        ] as const
                                      ).map((action) => (
                                        <option key={action} value={action}>
                                          {sourceActionLabels[action]}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      value={sourceForm.reason}
                                      onChange={(event) =>
                                        updateSourceForm(source.id, {
                                          reason: event.target.value,
                                          error: null,
                                          message: null,
                                        })
                                      }
                                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                                      placeholder="Причина"
                                    />
                                    <input
                                      value={sourceForm.confirmation}
                                      onChange={(event) =>
                                        updateSourceForm(source.id, {
                                          confirmation: event.target.value,
                                          error: null,
                                          message: null,
                                        })
                                      }
                                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                                      placeholder={tenant.slug}
                                    />
                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() =>
                                        void submitSourceAction(tenant, source)
                                      }
                                      className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold transition hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:hover:text-emerald-200"
                                    >
                                      Записать
                                    </button>
                                  </div>
                                  <input
                                    value={sourceForm.supportTicket}
                                    onChange={(event) =>
                                      updateSourceForm(source.id, {
                                        supportTicket: event.target.value,
                                        error: null,
                                        message: null,
                                      })
                                    }
                                    className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                                    placeholder="Support ticket, опционально"
                                  />
                                  {sourceForm.error ? (
                                    <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
                                      {sourceForm.error}
                                    </p>
                                  ) : null}
                                  {sourceForm.message ? (
                                    <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
                                      {sourceForm.message}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                          <p className="text-xs uppercase text-zinc-500">
                            Активные users
                          </p>
                          <p className="mt-1 font-semibold tabular-nums">
                            {formatNumber(tenant.activeUsersCount)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                          <p className="text-xs uppercase text-zinc-500">
                            Активные clubs
                          </p>
                          <p className="mt-1 font-semibold tabular-nums">
                            {formatNumber(tenant.activeStoresCount)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                          <p className="text-xs uppercase text-zinc-500">
                            Статус изменен
                          </p>
                          <p className="mt-1 font-semibold">
                            {formatDate(tenant.statusChangedAt)}
                          </p>
                        </div>
                      </div>
                      {tenant.statusReason ? (
                        <p className="rounded-lg border border-zinc-200 bg-white p-3 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                          {tenant.statusReason}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                      <p className="text-xs font-semibold uppercase text-zinc-500">
                        Lifecycle и support
                      </p>
                      <div className="mt-3 grid gap-3">
                        <label className="text-sm">
                          <span className="text-xs font-semibold uppercase text-zinc-500">
                            Действие
                          </span>
                          <select
                            value={form.action}
                            onChange={(event) =>
                              updateForm(tenant.id, {
                                action: event.target
                                  .value as LifecycleAction,
                                error: null,
                                message: null,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            {(["ACTIVATE", "SUSPEND", "ARCHIVE"] as const).map(
                              (action) => (
                                <option key={action} value={action}>
                                  {actionLabels[action]}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="text-sm">
                          <span className="text-xs font-semibold uppercase text-zinc-500">
                            Причина
                          </span>
                          <textarea
                            value={form.reason}
                            onChange={(event) =>
                              updateForm(tenant.id, {
                                reason: event.target.value,
                                error: null,
                                message: null,
                              })
                            }
                            rows={3}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                          />
                        </label>
                        <label className="text-sm">
                          <span className="text-xs font-semibold uppercase text-zinc-500">
                            Support ticket
                          </span>
                          <input
                            value={form.supportTicket}
                            onChange={(event) =>
                              updateForm(tenant.id, {
                                supportTicket: event.target.value,
                                error: null,
                                message: null,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                            placeholder="опционально"
                          />
                        </label>
                        <label className="text-sm">
                          <span className="text-xs font-semibold uppercase text-zinc-500">
                            Подтверждение slug
                          </span>
                          <input
                            value={form.confirmation}
                            onChange={(event) =>
                              updateForm(tenant.id, {
                                confirmation: event.target.value,
                                error: null,
                                message: null,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                            placeholder={tenant.slug}
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => void submitLifecycle(tenant)}
                            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Выполнить действие
                          </button>
                        </div>
                        <label className="text-sm">
                          <span className="text-xs font-semibold uppercase text-zinc-500">
                            Support-заметка
                          </span>
                          <textarea
                            value={form.supportNote}
                            onChange={(event) =>
                              updateForm(tenant.id, {
                                supportNote: event.target.value,
                                error: null,
                                message: null,
                              })
                            }
                            rows={3}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => void submitSupportNote(tenant)}
                          className="w-fit rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:hover:text-emerald-200"
                        >
                          Добавить заметку
                        </button>
                        {form.error ? (
                          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
                            {form.error}
                          </p>
                        ) : null}
                        {form.message ? (
                          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-200">
                            {form.message}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section
          id="sync-jobs"
          className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
              Синхронизации
            </p>
            <h2 className="mt-1 text-base font-semibold">Последние sync jobs</h2>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {overview.recentSyncJobs.map((job) => (
              <div key={job.id} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">
                      {job.domain}
                    </p>
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                      {job.mode} / {job.trigger} / {formatDate(job.startedAt)}
                    </p>
                  </div>
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      job.status === "SUCCESS"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                        : "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200",
                    ].join(" ")}
                  >
                    {job.status}
                  </span>
                </div>
                <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                  Клубов: {formatNumber(job.storesCount)}, товаров:{" "}
                  {formatNumber(job.productsCount)}, остатков:{" "}
                  {formatNumber(job.inventoryCount)}, продаж:{" "}
                  {formatNumber(job.salesCount)}, расхождений:{" "}
                  {formatNumber(job.discrepancyCount)}
                </p>
                {job.errorMessage ? (
                  <p className="mt-2 text-red-700 dark:text-red-300">
                    {job.errorMessage}
                  </p>
                ) : null}
              </div>
            ))}
            {overview.recentSyncJobs.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">
                Синхронизаций пока не было.
              </p>
            ) : null}
          </div>
        </section>

        <section
          id="audit"
          className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  Audit trail
                </p>
                <h2 className="mt-1 text-base font-semibold">
                  Журнал действий платформы
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Фильтруйте действия по tenant, actor, типу объекта и периоду.
                </p>
              </div>
              <a
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:text-emerald-200"
                href={auditExportHref}
              >
                Скачать CSV
              </a>
            </div>
            <div className="mt-4 grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40 lg:grid-cols-[1.1fr_1fr_0.9fr_0.8fr_0.8fr_120px]">
              <label className="text-xs font-semibold uppercase text-zinc-500">
                Tenant
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal normal-case text-zinc-950 outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  value={auditFilters.tenantId}
                  onChange={(event) =>
                    updateAuditFilter({ tenantId: event.target.value })
                  }
                >
                  <option value="">Все сети</option>
                  {overview.tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase text-zinc-500">
                Actor
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal normal-case text-zinc-950 outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  placeholder="email, имя или id"
                  value={auditFilters.actor}
                  onChange={(event) =>
                    updateAuditFilter({ actor: event.target.value })
                  }
                />
              </label>
              <label className="text-xs font-semibold uppercase text-zinc-500">
                Тип объекта
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal normal-case text-zinc-950 outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  value={auditFilters.targetType}
                  onChange={(event) =>
                    updateAuditFilter({ targetType: event.target.value })
                  }
                >
                  <option value="">Все типы</option>
                  {targetTypeOptions.map((targetType) => (
                    <option key={targetType} value={targetType}>
                      {targetType}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase text-zinc-500">
                С даты
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal normal-case text-zinc-950 outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  type="date"
                  value={auditFilters.dateFrom}
                  onChange={(event) =>
                    updateAuditFilter({ dateFrom: event.target.value })
                  }
                />
              </label>
              <label className="text-xs font-semibold uppercase text-zinc-500">
                По дату
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal normal-case text-zinc-950 outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  type="date"
                  value={auditFilters.dateTo}
                  onChange={(event) =>
                    updateAuditFilter({ dateTo: event.target.value })
                  }
                />
              </label>
              <label className="text-xs font-semibold uppercase text-zinc-500">
                Лимит
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal normal-case text-zinc-950 outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  min="1"
                  max="200"
                  type="number"
                  value={auditFilters.limit}
                  onChange={(event) =>
                    updateAuditFilter({ limit: event.target.value })
                  }
                />
              </label>
              <div className="flex flex-wrap items-end gap-2 lg:col-span-6">
                <button
                  type="button"
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isAuditLoading}
                  onClick={loadAuditEvents}
                >
                  {isAuditLoading ? "Загружаем..." : "Применить"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-800 dark:hover:text-emerald-200"
                  onClick={resetAuditFilters}
                >
                  Сбросить
                </button>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Показано: {formatNumber(auditCount)}
                </span>
              </div>
            </div>
            {auditError ? (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
                {auditError}
              </p>
            ) : null}
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {auditEvents.map((event) => (
              <div key={event.id} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{event.action}</p>
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                      {event.tenant?.name ?? "tenant удален"} ·{" "}
                      {event.actor?.fullName ||
                        event.actor?.email ||
                        "неизвестный actor"}{" "}
                      · {formatDate(event.createdAt)}
                    </p>
                  </div>
                  <span className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-semibold dark:border-zinc-800">
                    {event.targetType}
                  </span>
                </div>
                {event.reason ? (
                  <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                    {event.reason}
                  </p>
                ) : null}
              </div>
            ))}
            {auditEvents.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">
                По выбранным фильтрам действий пока нет.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

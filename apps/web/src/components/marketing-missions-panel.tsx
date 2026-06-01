"use client";

import { useMemo, useState, type ReactNode } from "react";
import type {
  MarketingMission,
  MarketingMissionReward,
  MarketingMissionRewardStatus,
  MarketingMissionRewardType,
  MarketingMissionStatus,
  MarketingMissionTriggerKind,
  MarketingMissionType,
} from "@/lib/marketing";
import type { GuestAudience } from "@/lib/guests";
import type { Store } from "@/lib/stores";

type MissionFormState = {
  id: string | null;
  name: string;
  status: MarketingMissionStatus;
  missionType: MarketingMissionType;
  triggerKind: MarketingMissionTriggerKind;
  rewardType: MarketingMissionRewardType;
  rewardAmount: string;
  rewardLabel: string;
  audienceId: string;
  storeIds: string[];
  periodFrom: string;
  periodTo: string;
  budgetAmount: string;
  perGuestLimit: string;
  totalRewardLimit: string;
  manualApprovalRequired: boolean;
  conditionsText: string;
  antiFraudText: string;
  note: string;
};

type RewardFormState = {
  missionId: string;
  guestExternalId: string;
  externalDomain: string;
  storeId: string;
  qualifiedAt: string;
  rewardAmount: string;
  rewardLabel: string;
  note: string;
};

type Props = {
  missions: MarketingMission[];
  rewards: MarketingMissionReward[];
  audiences: GuestAudience[];
  stores: Store[];
};

const fieldClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white";

const missionTypeOptions: Array<{
  value: MarketingMissionType;
  label: string;
  description: string;
}> = [
  {
    value: "QUIET_HOURS",
    label: "Тихие часы",
    description: "Привести гостей в недозагруженные интервалы.",
  },
  {
    value: "SECOND_VISIT",
    label: "Повторный визит",
    description: "Вернуть нового гостя быстрее обычного.",
  },
  {
    value: "BAR_PURCHASE",
    label: "Бар",
    description: "Стимулировать покупку бара или услуги.",
  },
  {
    value: "BIRTHDAY_EVENT",
    label: "Событие",
    description: "День рождения, бронь, турнир или мероприятие.",
  },
  {
    value: "REFERRAL",
    label: "Реферал",
    description: "Гость привел друга, нужна ручная проверка.",
  },
  {
    value: "TOURNAMENT",
    label: "Турнир",
    description: "Награда за участие или результат события.",
  },
  {
    value: "CUSTOM",
    label: "Своя миссия",
    description: "Любое условие с ручным подтверждением факта.",
  },
];

const rewardStatusLabels: Record<MarketingMissionRewardStatus, string> = {
  PENDING: "к выдаче",
  APPROVED: "согласовано",
  PAID: "выдано",
  CANCELED: "отменено",
};

const missionStatusLabels: Record<MarketingMissionStatus, string> = {
  DRAFT: "черновик",
  ACTIVE: "активна",
  PAUSED: "пауза",
  FINISHED: "завершена",
  ARCHIVED: "архив",
};

const rewardTypeLabels: Record<MarketingMissionRewardType, string> = {
  BONUS: "Бонусы",
  BALANCE: "Баланс",
  PLAY_TIME: "Игровое время",
  PROMO_BUNDLE: "Промо-набор",
  MANUAL: "Ручная награда",
};

const triggerLabels: Record<MarketingMissionTriggerKind, string> = {
  VISIT: "Визит",
  REPEAT_VISIT: "Повторный визит",
  PLAY_HOURS: "Игровые часы",
  BAR_PURCHASE: "Покупка бара",
  BALANCE_TOPUP: "Пополнение",
  EVENT_PARTICIPATION: "Событие",
  REFERRAL: "Реферал",
  MANUAL: "Ручная проверка",
};

export function MarketingMissionsPanel({
  missions: initialMissions,
  rewards: initialRewards,
  audiences,
  stores,
}: Props) {
  const [missions, setMissions] = useState(initialMissions);
  const [rewards, setRewards] = useState(initialRewards);
  const [selectedMissionId, setSelectedMissionId] = useState(
    initialMissions[0]?.id ?? "",
  );
  const selectedMission =
    missions.find((mission) => mission.id === selectedMissionId) ??
    missions[0] ??
    null;
  const [form, setForm] = useState<MissionFormState>(() =>
    buildMissionForm(selectedMission),
  );
  const [rewardForm, setRewardForm] = useState<RewardFormState>(() =>
    buildRewardForm(selectedMission),
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredMissions = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return missions;
    }

    return missions.filter((mission) =>
      [mission.name, missionTypeLabel(mission.missionType), mission.note]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [missions, query]);

  const selectedRewards = useMemo(
    () =>
      rewards.filter((reward) =>
        selectedMission ? reward.mission.id === selectedMission.id : true,
      ),
    [rewards, selectedMission],
  );

  function startNewMission(type: MarketingMissionType = "QUIET_HOURS") {
    const next = buildMissionForm(null, type);
    setForm(next);
    setSelectedMissionId("");
    setRewardForm(buildRewardForm(null));
    setError(null);
  }

  function editMission(mission: MarketingMission) {
    setSelectedMissionId(mission.id);
    setForm(buildMissionForm(mission));
    setRewardForm(buildRewardForm(mission));
    setError(null);
  }

  async function reloadData(nextSelectedId?: string) {
    const [missionsResponse, rewardsResponse] = await Promise.all([
      fetch("/api/marketing/missions", { cache: "no-store" }),
      fetch("/api/marketing/mission-rewards", { cache: "no-store" }),
    ]);

    if (!missionsResponse.ok || !rewardsResponse.ok) {
      throw new Error("Не удалось обновить список миссий");
    }

    const [nextMissions, nextRewards] = (await Promise.all([
      missionsResponse.json(),
      rewardsResponse.json(),
    ])) as [MarketingMission[], MarketingMissionReward[]];

    setMissions(nextMissions);
    setRewards(nextRewards);

    if (nextSelectedId) {
      setSelectedMissionId(nextSelectedId);
      setRewardForm(
        buildRewardForm(
          nextMissions.find((mission) => mission.id === nextSelectedId) ?? null,
        ),
      );
    }
  }

  async function saveMission() {
    setSaving(true);
    setError(null);

    try {
      const conditions = parseJsonObject(form.conditionsText, "условия");
      const antiFraudRules = parseJsonObject(
        form.antiFraudText,
        "антифрод",
      );
      const payload = {
        name: form.name,
        status: form.status,
        missionType: form.missionType,
        triggerKind: form.triggerKind,
        rewardType: form.rewardType,
        rewardAmount: form.rewardAmount,
        rewardLabel: form.rewardLabel,
        audienceId: form.audienceId || null,
        storeIds: form.storeIds,
        periodFrom: form.periodFrom || null,
        periodTo: form.periodTo || null,
        budgetAmount: form.budgetAmount,
        perGuestLimit: form.perGuestLimit,
        totalRewardLimit: form.totalRewardLimit,
        manualApprovalRequired: form.manualApprovalRequired,
        conditions,
        antiFraudRules,
        note: form.note,
      };
      const response = await fetch(
        form.id
          ? `/api/marketing/missions/${encodeURIComponent(form.id)}`
          : "/api/marketing/missions",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? "Не удалось сохранить миссию");
      }

      const saved = (await response.json()) as MarketingMission;
      await reloadData(saved.id);
      setForm(buildMissionForm(saved));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function addReward() {
    if (!rewardForm.missionId) {
      setError("Сначала выберите миссию");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/marketing/mission-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: rewardForm.missionId,
          guestExternalId: rewardForm.guestExternalId,
          externalDomain: rewardForm.externalDomain,
          storeId: rewardForm.storeId || null,
          qualifiedAt: rewardForm.qualifiedAt || null,
          rewardAmount: rewardForm.rewardAmount,
          rewardLabel: rewardForm.rewardLabel,
          note: rewardForm.note,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? "Не удалось добавить награду");
      }

      await reloadData(rewardForm.missionId);
      setRewardForm(buildRewardForm(selectedMission));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка награды");
    } finally {
      setSaving(false);
    }
  }

  async function updateRewardStatus(
    reward: MarketingMissionReward,
    status: MarketingMissionRewardStatus,
  ) {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/marketing/mission-rewards/${encodeURIComponent(reward.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? "Не удалось обновить статус");
      }

      await reloadData(reward.mission.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка статуса");
    } finally {
      setSaving(false);
    }
  }

  function patchForm(patch: Partial<MissionFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-600 dark:text-emerald-400">
              Маркетинг
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-zinc-950 dark:text-white">
              Миссии и ручные награды
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Настраивайте условия по данным Langame, лимиты, бюджет и очередь
              ручной выдачи. Автоматических начислений в Langame здесь нет.
            </p>
          </div>
          <button
            type="button"
            onClick={() => startNewMission()}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            Новая миссия
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.35fr]">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                Каталог
              </p>
              <h2 className="text-xl font-semibold text-zinc-950 dark:text-white">
                Существующие миссии
              </h2>
            </div>
            <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {missions.length} шт.
            </span>
          </div>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию, типу или заметке"
            className="mt-4 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900"
          />

          <div className="mt-4 space-y-3">
            {filteredMissions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Миссий пока нет. Выберите шаблон справа и сохраните первый
                сценарий.
              </div>
            ) : (
              filteredMissions.map((mission) => (
                <button
                  key={mission.id}
                  type="button"
                  onClick={() => editMission(mission)}
                  className={[
                    "w-full rounded-lg border p-4 text-left transition",
                    selectedMission?.id === mission.id
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-zinc-200 hover:border-emerald-500/70 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-zinc-950 dark:text-white">
                        {mission.name}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        {missionTypeLabel(mission.missionType)} ·{" "}
                        {triggerLabels[mission.triggerKind]} ·{" "}
                        {mission.rewardLabel ?? rewardTypeLabels[mission.rewardType]}
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {missionStatusLabels[mission.status]}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <Metric label="К выдаче" value={mission.rewardSummary.pending} />
                    <Metric label="Согласовано" value={mission.rewardSummary.approved} />
                    <Metric label="Выдано" value={mission.rewardSummary.paid} />
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                Конструктор
              </p>
              <h2 className="text-xl font-semibold text-zinc-950 dark:text-white">
                {form.id ? "Редактирование миссии" : "Новая миссия"}
              </h2>
            </div>
            <select
              value={form.status}
              onChange={(event) =>
                patchForm({ status: event.target.value as MarketingMissionStatus })
              }
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              {Object.entries(missionStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {missionTypeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  const preset = missionPreset(option.value);
                  patchForm({
                    missionType: option.value,
                    triggerKind: preset.triggerKind,
                    conditionsText: JSON.stringify(preset.conditions, null, 2),
                  });
                }}
                className={[
                  "rounded-lg border p-3 text-left transition",
                  form.missionType === option.value
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-zinc-200 hover:border-emerald-500/70 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
                ].join(" ")}
              >
                <div className="font-semibold text-zinc-950 dark:text-white">
                  {option.label}
                </div>
                <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {option.description}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Название">
              <input
                value={form.name}
                onChange={(event) => patchForm({ name: event.target.value })}
                placeholder="Например: второй визит за 14 дней"
                className={fieldClass}
              />
            </Field>
            <Field label="Сегмент гостей">
              <select
                value={form.audienceId}
                onChange={(event) => patchForm({ audienceId: event.target.value })}
                className={fieldClass}
              >
                <option value="">Без сегмента</option>
                {audiences.map((audience) => (
                  <option key={audience.id} value={audience.id}>
                    {audience.name} · {audience.guestsCount}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Тип факта">
              <select
                value={form.triggerKind}
                onChange={(event) =>
                  patchForm({
                    triggerKind: event.target.value as MarketingMissionTriggerKind,
                  })
                }
                className={fieldClass}
              >
                {Object.entries(triggerLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Награда">
              <select
                value={form.rewardType}
                onChange={(event) =>
                  patchForm({
                    rewardType: event.target.value as MarketingMissionRewardType,
                  })
                }
                className={fieldClass}
              >
                {Object.entries(rewardTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Сумма награды, руб">
              <input
                value={form.rewardAmount}
                onChange={(event) =>
                  patchForm({ rewardAmount: event.target.value })
                }
                inputMode="decimal"
                className={fieldClass}
              />
            </Field>
            <Field label="Название награды">
              <input
                value={form.rewardLabel}
                onChange={(event) =>
                  patchForm({ rewardLabel: event.target.value })
                }
                placeholder="Например: 300 бонусов"
                className={fieldClass}
              />
            </Field>
            <Field label="Начало">
              <input
                type="date"
                value={form.periodFrom}
                onChange={(event) =>
                  patchForm({ periodFrom: event.target.value })
                }
                className={fieldClass}
              />
            </Field>
            <Field label="Конец">
              <input
                type="date"
                value={form.periodTo}
                onChange={(event) => patchForm({ periodTo: event.target.value })}
                className={fieldClass}
              />
            </Field>
            <Field label="Бюджет, руб">
              <input
                value={form.budgetAmount}
                onChange={(event) =>
                  patchForm({ budgetAmount: event.target.value })
                }
                inputMode="decimal"
                className={fieldClass}
              />
            </Field>
            <Field label="Лимит на гостя">
              <input
                value={form.perGuestLimit}
                onChange={(event) =>
                  patchForm({ perGuestLimit: event.target.value })
                }
                inputMode="numeric"
                className={fieldClass}
              />
            </Field>
            <Field label="Общий лимит наград">
              <input
                value={form.totalRewardLimit}
                onChange={(event) =>
                  patchForm({ totalRewardLimit: event.target.value })
                }
                inputMode="numeric"
                className={fieldClass}
              />
            </Field>
            <Field label="Клубы">
              <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
                <label className="flex items-center gap-2 px-1 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={form.storeIds.length === 0}
                    onChange={() => patchForm({ storeIds: [] })}
                  />
                  Вся сеть
                </label>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {stores.map((store) => (
                    <label
                      key={store.id}
                      className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <input
                        type="checkbox"
                        checked={form.storeIds.includes(store.id)}
                        onChange={(event) =>
                          patchForm({
                            storeIds: event.target.checked
                              ? [...form.storeIds, store.id]
                              : form.storeIds.filter((id) => id !== store.id),
                          })
                        }
                      />
                      {store.name}
                    </label>
                  ))}
                </div>
              </div>
            </Field>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={form.manualApprovalRequired}
              onChange={(event) =>
                patchForm({ manualApprovalRequired: event.target.checked })
              }
            />
            Награда попадает в ручную очередь и выдается только после проверки
          </label>

          <details className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-950 dark:text-white">
              Точные условия и антифрод
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Условия">
                <textarea
                  value={form.conditionsText}
                  onChange={(event) =>
                    patchForm({ conditionsText: event.target.value })
                  }
                  rows={8}
                  className={`${fieldClass} font-mono text-xs`}
                />
              </Field>
              <Field label="Антифрод">
                <textarea
                  value={form.antiFraudText}
                  onChange={(event) =>
                    patchForm({ antiFraudText: event.target.value })
                  }
                  rows={8}
                  className={`${fieldClass} font-mono text-xs`}
                />
              </Field>
            </div>
          </details>

          <Field label="Заметка">
            <textarea
              value={form.note}
              onChange={(event) => patchForm({ note: event.target.value })}
              rows={3}
              className={fieldClass}
              placeholder="Что должен проверить управляющий перед выдачей награды"
            />
          </Field>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveMission}
              disabled={saving}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {form.id ? "Сохранить изменения" : "Создать миссию"}
            </button>
            <button
              type="button"
              onClick={() => startNewMission(form.missionType)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:border-zinc-400 dark:border-zinc-800"
            >
              Очистить форму
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">
              Очередь
            </p>
            <h2 className="text-xl font-semibold text-zinc-950 dark:text-white">
              Ручные награды
            </h2>
          </div>
          <select
            value={rewardForm.missionId}
            onChange={(event) => {
              const mission =
                missions.find((item) => item.id === event.target.value) ??
                null;
              setSelectedMissionId(event.target.value);
              setRewardForm(buildRewardForm(mission));
            }}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <option value="">Выберите миссию</option>
            {missions.map((mission) => (
              <option key={mission.id} value={mission.id}>
                {mission.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <input
            value={rewardForm.guestExternalId}
            onChange={(event) =>
              setRewardForm((current) => ({
                ...current,
                guestExternalId: event.target.value,
              }))
            }
            placeholder="guest_id"
            className={fieldClass}
          />
          <input
            value={rewardForm.externalDomain}
            onChange={(event) =>
              setRewardForm((current) => ({
                ...current,
                externalDomain: event.target.value,
              }))
            }
            placeholder="домен Langame"
            className={fieldClass}
          />
          <select
            value={rewardForm.storeId}
            onChange={(event) =>
              setRewardForm((current) => ({
                ...current,
                storeId: event.target.value,
              }))
            }
            className={fieldClass}
          >
            <option value="">Клуб не выбран</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={rewardForm.qualifiedAt}
            onChange={(event) =>
              setRewardForm((current) => ({
                ...current,
                qualifiedAt: event.target.value,
              }))
            }
            className={fieldClass}
          />
          <input
            value={rewardForm.rewardAmount}
            onChange={(event) =>
              setRewardForm((current) => ({
                ...current,
                rewardAmount: event.target.value,
              }))
            }
            placeholder="сумма"
            className={fieldClass}
          />
          <button
            type="button"
            onClick={addReward}
            disabled={saving || !rewardForm.missionId}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            В очередь
          </button>
        </div>
        <input
          value={rewardForm.rewardLabel}
          onChange={(event) =>
            setRewardForm((current) => ({
              ...current,
              rewardLabel: event.target.value,
            }))
          }
          placeholder="Название награды"
          className={`${fieldClass} mt-3`}
        />
        <textarea
          value={rewardForm.note}
          onChange={(event) =>
            setRewardForm((current) => ({ ...current, note: event.target.value }))
          }
          rows={2}
          placeholder="Основание для ручной выдачи"
          className={`${fieldClass} mt-3`}
        />

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-2 pr-4">Гость</th>
                <th className="py-2 pr-4">Миссия</th>
                <th className="py-2 pr-4">Награда</th>
                <th className="py-2 pr-4">Статус</th>
                <th className="py-2 pr-4">Дата</th>
                <th className="py-2 pr-4">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {selectedRewards.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-6 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    В очереди пока нет наград по выбранной миссии.
                  </td>
                </tr>
              ) : (
                selectedRewards.map((reward) => (
                  <tr key={reward.id}>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-zinc-950 dark:text-white">
                        {reward.guest?.displayName ??
                          reward.guestExternalId ??
                          "гость не сопоставлен"}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {reward.externalDomain ?? reward.guest?.externalDomain}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{reward.mission.name}</td>
                    <td className="py-3 pr-4">
                      {formatRubles(reward.rewardAmount)} · {reward.rewardLabel}
                    </td>
                    <td className="py-3 pr-4">
                      {rewardStatusLabels[reward.status]}
                    </td>
                    <td className="py-3 pr-4">
                      {formatDate(reward.qualifiedAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {reward.status === "PENDING" ? (
                          <button
                            type="button"
                            onClick={() => updateRewardStatus(reward, "APPROVED")}
                            className="rounded border border-emerald-500/50 px-2 py-1 text-xs text-emerald-600 transition hover:bg-emerald-500/10 dark:text-emerald-300"
                          >
                            Согласовать
                          </button>
                        ) : null}
                        {reward.status === "APPROVED" ? (
                          <button
                            type="button"
                            onClick={() => updateRewardStatus(reward, "PAID")}
                            className="rounded border border-emerald-500/50 px-2 py-1 text-xs text-emerald-600 transition hover:bg-emerald-500/10 dark:text-emerald-300"
                          >
                            Выдано
                          </button>
                        ) : null}
                        {reward.status !== "CANCELED" &&
                        reward.status !== "PAID" ? (
                          <button
                            type="button"
                            onClick={() => updateRewardStatus(reward, "CANCELED")}
                            className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-500 transition hover:border-rose-400 hover:text-rose-500 dark:border-zinc-700"
                          >
                            Отменить
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-zinc-200 px-2 py-1 dark:border-zinc-800">
      <div className="font-semibold text-zinc-950 dark:text-white">{value}</div>
      <div>{label}</div>
    </div>
  );
}

function buildMissionForm(
  mission: MarketingMission | null,
  missionType: MarketingMissionType = "QUIET_HOURS",
): MissionFormState {
  const preset = missionPreset(mission?.missionType ?? missionType);

  return {
    id: mission?.id ?? null,
    name: mission?.name ?? "",
    status: mission?.status ?? "DRAFT",
    missionType: mission?.missionType ?? missionType,
    triggerKind: mission?.triggerKind ?? preset.triggerKind,
    rewardType: mission?.rewardType ?? "BONUS",
    rewardAmount: mission?.rewardAmount ? String(mission.rewardAmount) : "300",
    rewardLabel: mission?.rewardLabel ?? "",
    audienceId: mission?.audience?.id ?? "",
    storeIds: mission?.storeIds ?? [],
    periodFrom: dateInputValue(mission?.periodFrom),
    periodTo: dateInputValue(mission?.periodTo),
    budgetAmount: mission?.budgetAmount ? String(mission.budgetAmount) : "",
    perGuestLimit: mission?.perGuestLimit ? String(mission.perGuestLimit) : "1",
    totalRewardLimit: mission?.totalRewardLimit
      ? String(mission.totalRewardLimit)
      : "100",
    manualApprovalRequired: mission?.manualApprovalRequired ?? true,
    conditionsText: JSON.stringify(mission?.conditions ?? preset.conditions, null, 2),
    antiFraudText: JSON.stringify(
      mission?.antiFraudRules ?? defaultAntiFraudRules(),
      null,
      2,
    ),
    note: mission?.note ?? "",
  };
}

function buildRewardForm(mission: MarketingMission | null): RewardFormState {
  return {
    missionId: mission?.id ?? "",
    guestExternalId: "",
    externalDomain: "",
    storeId: "",
    qualifiedAt: new Date().toISOString().slice(0, 10),
    rewardAmount: mission?.rewardAmount ? String(mission.rewardAmount) : "",
    rewardLabel: mission?.rewardLabel ?? "",
    note: "",
  };
}

function missionPreset(missionType: MarketingMissionType): {
  triggerKind: MarketingMissionTriggerKind;
  conditions: Record<string, unknown>;
} {
  const presets: Record<
    MarketingMissionType,
    { triggerKind: MarketingMissionTriggerKind; conditions: Record<string, unknown> }
  > = {
    QUIET_HOURS: {
      triggerKind: "VISIT",
      conditions: {
        dataSource: "Langame GuestSession",
        quietHours: ["10:00-16:00"],
        minVisits: 1,
        calculationMode: "manual_review",
      },
    },
    SECOND_VISIT: {
      triggerKind: "REPEAT_VISIT",
      conditions: {
        dataSource: "Langame GuestSession",
        minVisits: 2,
        windowDays: 14,
        calculationMode: "manual_review",
      },
    },
    BAR_PURCHASE: {
      triggerKind: "BAR_PURCHASE",
      conditions: {
        dataSource: "SalesFact.guestId",
        minBarSpend: 300,
        calculationMode: "manual_review",
      },
    },
    BIRTHDAY_EVENT: {
      triggerKind: "EVENT_PARTICIPATION",
      conditions: {
        dataSource: "CRM/event list",
        eventWindowDays: 7,
        calculationMode: "manual_review",
      },
    },
    REFERRAL: {
      triggerKind: "REFERRAL",
      conditions: {
        dataSource: "manual evidence",
        requiresAntiSelfReferralCheck: true,
        calculationMode: "manual_review",
      },
    },
    TOURNAMENT: {
      triggerKind: "EVENT_PARTICIPATION",
      conditions: {
        dataSource: "event participants",
        eventName: "Турнир",
        calculationMode: "manual_review",
      },
    },
    CUSTOM: {
      triggerKind: "MANUAL",
      conditions: {
        dataSource: "manual evidence",
        description: "Опишите условие выполнения",
        calculationMode: "manual_review",
      },
    },
  };

  return presets[missionType];
}

function defaultAntiFraudRules() {
  return {
    oneRewardPerGuestByDefault: true,
    requireManualApprovalBeforeLangameWrite: true,
    checkDuplicateExternalId: true,
    checkSelfReferral: true,
  };
}

function parseJsonObject(value: string, label: string) {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error();
    }

    return parsed;
  } catch {
    throw new Error(`Проверьте JSON в блоке "${label}"`);
  }
}

function missionTypeLabel(type: MarketingMissionType) {
  return (
    missionTypeOptions.find((option) => option.value === type)?.label ??
    "Своя миссия"
  );
}

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

function formatRubles(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(value);
}

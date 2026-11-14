"use client";

import type {
  MissionForm,
  RuleTemplateType,
  MissionMigrationNotice,
  MissionQuestStepForm,
  GuestLogEventOption,
} from "../shared/types";
import type {
  GuestGameMission,
  GuestGameTariffSnapshotEndpoint,
  GuestGameGuestLogCatalog,
  GuestGameStatus,
} from "@/lib/guest-gamification";
import type { GuestAudience } from "@/lib/guests";
import type { Store } from "@/lib/stores";
import type { Product } from "@/lib/products";
import { useState, useMemo } from "react";
import {
  RulesLayout,
  RuleCommonFields,
  StoreSelect,
  RuleCard,
  BusinessRuleSection,
  TariffConditionFields,
  SelectedGuestLogEvents,
} from "../shared/rule-fields";
import {
  smallButtonClass,
  primaryButtonClass,
  fieldClass,
  sessionTypeOptions,
  defaultMissionQuestSteps,
  dryRunEventOptions,
  triggerHelpText,
} from "../shared/constants";
import Link from "next/link";
import { Field, OptionSelect, OptionHelp, ToggleField } from "../shared/ui";
import {
  missionVisibilityValue,
  trackingId,
  sessionTypeLabel,
  stringRule,
  tariffRuleSummary,
  guestLogRuleSummary,
  formatBudgetAmount,
  missionQuestSteps,
  cloneMissionQuestSteps,
  guestLogEventOptions,
  csvList,
  appendCsvToken,
  csvHasToken,
  removeCsvToken,
  appendCsvTokens,
  optionLabel,
  metricRule,
  stringListRule,
  formatDate,
} from "../shared/helpers";

export const missionTypeOptions = [
  { value: "REPEAT_VISIT", label: "Повторный визит" },
  { value: "CHECK_IN", label: "Чекин в клубе" },
  { value: "VISIT", label: "Посещение клуба" },
  { value: "PLAY_HOUR", label: "Игровое время" },
  { value: "BAR_PURCHASE", label: "Покупка в баре" },
  { value: "PRODUCT_PURCHASE", label: "Покупка товара" },
  { value: "BALANCE_TOPUP", label: "Пополнение баланса" },
  { value: "REFERRAL_ACCEPTED", label: "Приглашение друга" },
  { value: "APP_OPEN", label: "Возврат в приложение" },
  { value: "GUEST_LOG", label: "Событие Langame" },
  { value: "CUSTOM", label: "Свое задание" },
];

export const missionTypeHelpText: Record<string, string> = {
  REPEAT_VISIT:
    "Задание засчитывает повторное посещение в заданном окне времени.",
  CHECK_IN:
    "Задание засчитывает чекин гостя в игровом модуле выбранного клуба.",
  VISIT:
    "Задание засчитывает факт визита: сессию, чекин или подходящий лог Langame.",
  PLAY_HOUR:
    "Задание считает накопленное игровое время или длительность сессии.",
  BAR_PURCHASE:
    "Задание считает покупки бара по сохраненным продажам или списаниям.",
  PRODUCT_PURCHASE: "Задание считает покупку выбранных товаров или категорий.",
  BALANCE_TOPUP:
    "Задание считает пополнение баланса гостя по сохраненным фактам Langame.",
  REFERRAL_ACCEPTED:
    "Задание засчитывает регистрацию приглашенного друга в игровом модуле.",
  APP_OPEN:
    "Задание срабатывает при открытии сайта, игрового модуля или Mini App.",
  GUEST_LOG:
    "Задание работает от выбранных событий Langame из подготовленного каталога.",
  CUSTOM: "Свободный сценарий: событие и условия задаются ниже вручную.",
};

export const progressUnitOptions = [
  { value: "visit", label: "визиты" },
  { value: "check_in", label: "чекины" },
  { value: "minute", label: "минуты игры" },
  { value: "purchase", label: "покупки" },
  { value: "rub", label: "рубли" },
  { value: "day", label: "уникальные дни" },
  { value: "friend", label: "друзья" },
  { value: "event", label: "события" },
  { value: "step", label: "шаги" },
];

export const missionVisibilityOptions = [
  { value: "VISIBLE", label: "Видимое" },
  { value: "HIDDEN", label: "Скрытое" },
];

export const missionVisibilityHelpText: Record<string, string> = {
  VISIBLE:
    "Задание будет видно гостям в игровом модуле сразу, если оно активно и подходит выбранному клубу.",
  HIDDEN:
    "Гости не увидят задание заранее. Оно появится только после выполнения как скрытая активность.",
};

export const maxMissionQuestSteps = 10;

export function MissionsTab({
  form,
  setForm,
  missions,
  audiences,
  stores,
  products,
  productsLoading,
  tariffSnapshots,
  guestLogCatalog,
  editingId,
  isFormOpen,
  onSave,
  onEdit,
  onCreateNew,
  onReset,
  onStatus,
  onDelete,
  legacyActiveMissionCount,
  migrationNotice,
  onMigrateActive,
  saving,
  canManage,
}: {
  form: MissionForm;
  setForm: (form: MissionForm) => void;
  missions: GuestGameMission[];
  audiences: GuestAudience[];
  stores: Store[];
  products: Product[];
  productsLoading: boolean;
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  editingId: string | null;
  isFormOpen: boolean;
  onSave: () => Promise<void>;
  onEdit: (mission: GuestGameMission) => void;
  onCreateNew: () => void;
  onReset: () => void;
  onStatus: (
    type: RuleTemplateType,
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  onDelete: (type: RuleTemplateType, id: string, name: string) => Promise<void>;
  legacyActiveMissionCount: number;
  migrationNotice: MissionMigrationNotice | null;
  onMigrateActive: () => Promise<boolean>;
  saving: string | null;
  canManage: boolean;
}) {
  const [editorChoice, setEditorChoice] = useState<GuestGameMission | null>(
    null,
  );
  const [migrationConfirmation, setMigrationConfirmation] = useState(false);
  const missionTemplates = missions.filter(
    (mission) => mission.id !== editingId,
  );
  const missionTitle = form.name.trim();
  const formTitle =
    editingId && missionTitle
      ? `Редактирование задания "${missionTitle}"`
      : editingId
        ? "Редактирование задания"
        : "Настройка задания";

  return (
    <>
      <RulesLayout
        canManage={canManage}
        formTitle={formTitle}
        formAction={
          !isFormOpen ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {legacyActiveMissionCount > 0 && canManage ? (
                <button
                  type="button"
                  className={smallButtonClass}
                  onClick={() => setMigrationConfirmation(true)}
                  disabled={saving === "missions-migrate-wizard"}
                >
                  Перевести старые задания
                </button>
              ) : null}
              <Link
                href="/gamification/missions/wizard"
                className={`${primaryButtonClass} sm:min-w-64`}
              >
                Создать задание с помощью мастера
              </Link>
            </div>
          ) : undefined
        }
        form={
          isFormOpen ? (
            <div className="space-y-3">
              <RuleCommonFields
                status={form.status}
                name={form.name}
                rewardType={form.rewardType}
                rewardAmount={form.rewardAmount}
                rewardLabel={form.rewardLabel}
                audienceId={form.audienceId}
                budgetAmount={form.budgetAmount}
                budgetUnlimited={form.budgetUnlimited}
                manualApprovalRequired={form.manualApprovalRequired}
                note={form.note}
                audiences={audiences}
                onChange={(patch) => setForm({ ...form, ...patch })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Тип задания">
                  <OptionSelect
                    options={missionTypeOptions}
                    value={form.missionType}
                    preservedLabel="Сохраненный тип"
                    onChange={(missionType) =>
                      setForm({ ...form, missionType })
                    }
                  />
                  <OptionHelp>
                    {missionTypeHelpText[form.missionType] ??
                      "Тип помогает сотруднику понять сценарий задания. Условия выполнения задаются ниже."}
                  </OptionHelp>
                </Field>
                <Field label="Видимость задания">
                  <OptionSelect
                    options={missionVisibilityOptions}
                    value={form.visibility}
                    preservedLabel="Сохраненная видимость"
                    onChange={(visibility) => setForm({ ...form, visibility })}
                  />
                  <OptionHelp>
                    {missionVisibilityHelpText[
                      missionVisibilityValue(form.visibility)
                    ] ?? missionVisibilityHelpText.VISIBLE}
                  </OptionHelp>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="XP">
                  <input
                    className={fieldClass}
                    type="number"
                    value={form.xpReward}
                    onChange={(event) =>
                      setForm({ ...form, xpReward: event.target.value })
                    }
                  />
                  <OptionHelp>
                    Опыт, который игровой профиль гостя получит после выполнения
                    задания. XP повышает уровень и не влияет на цель задания.
                  </OptionHelp>
                </Field>
                <Field label="Цель">
                  <input
                    className={fieldClass}
                    type="number"
                    value={form.progressTarget}
                    onChange={(event) =>
                      setForm({ ...form, progressTarget: event.target.value })
                    }
                  />
                </Field>
                <Field label="Что считаем">
                  <OptionSelect
                    options={progressUnitOptions}
                    value={form.progressUnit}
                    preservedLabel="Сохраненная единица"
                    onChange={(progressUnit) =>
                      setForm({
                        ...form,
                        ...missionProgressUnitPatch(form, progressUnit),
                      })
                    }
                  />
                  <OptionHelp>
                    Показывается гостю как единица прогресса: визиты, минуты,
                    покупки или шаги.
                  </OptionHelp>
                </Field>
              </div>
              <StoreSelect
                stores={stores}
                value={form.storeIds}
                onChange={(storeIds) => setForm({ ...form, storeIds })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Начало">
                  <input
                    className={fieldClass}
                    type="datetime-local"
                    value={form.periodFrom}
                    onChange={(event) =>
                      setForm({ ...form, periodFrom: event.target.value })
                    }
                  />
                </Field>
                <Field label="Окончание">
                  <input
                    className={fieldClass}
                    type="datetime-local"
                    value={form.periodTo}
                    onChange={(event) =>
                      setForm({ ...form, periodTo: event.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Лимит на гостя">
                  <div className="space-y-2">
                    <input
                      className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:bg-zinc-900`}
                      type="number"
                      min="1"
                      value={
                        form.perGuestLimitUnlimited ? "" : form.perGuestLimit
                      }
                      disabled={form.perGuestLimitUnlimited}
                      placeholder={
                        form.perGuestLimitUnlimited
                          ? "Без ограничений"
                          : undefined
                      }
                      onChange={(event) =>
                        setForm({ ...form, perGuestLimit: event.target.value })
                      }
                    />
                    <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      <span>Безлимит</span>
                      <input
                        type="checkbox"
                        checked={form.perGuestLimitUnlimited}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            perGuestLimitUnlimited: event.target.checked,
                          })
                        }
                      />
                    </label>
                  </div>
                </Field>
                <Field label="Общий лимит">
                  <input
                    className={fieldClass}
                    type="number"
                    value={form.totalRewardLimit}
                    onChange={(event) =>
                      setForm({ ...form, totalRewardLimit: event.target.value })
                    }
                  />
                </Field>
              </div>
              <MissionBusinessRules
                form={form}
                missionTemplates={missionTemplates}
                tariffSnapshots={tariffSnapshots}
                guestLogCatalog={guestLogCatalog}
                products={products}
                onChange={(patch) => setForm({ ...form, ...patch })}
              />
              {productsLoading && form.missionType === "PRODUCT_PURCHASE" ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Загружаем каталог товаров…
                </p>
              ) : null}
              <button
                type="button"
                className={primaryButtonClass}
                disabled={saving === "mission"}
                onClick={onSave}
              >
                {editingId ? "Сохранить" : "Создать задание"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className={smallButtonClass}
                  onClick={onReset}
                >
                  Сбросить выбор
                </button>
              ) : null}
            </div>
          ) : null
        }
        listTitle="Созданные правила заданий"
        items={missions}
        layout="stacked"
        renderItem={(item) => (
          <RuleCard
            key={item.id}
            eyebrow="Сохраненное правило"
            trackingId={trackingId("TASK", item.id)}
            title={item.name}
            status={item.status}
            subtitle={`${missionTypeLabel(item.missionType)} · ${item.xpReward} XP`}
            meta={[
              item.audience?.name ?? "все гости",
              missionVisibilitySummary(item.conditions),
              missionAvailabilitySummary(item),
              `тип: ${sessionTypeLabel(stringRule(item.conditions, "sessionType", ""))}`,
              tariffRuleSummary(item.conditions),
              guestLogRuleSummary(item.conditions, item.antiFraudRules),
              missionMetricSummary(item.conditions),
              questRuleSummary(item.conditions),
              `${item.progressTarget ?? 1} ${item.progressUnit ?? "шаг"}`,
              formatBudgetAmount(item.budgetAmount),
            ]}
            details={<MissionQuestStepIdSummary mission={item} />}
            onEdit={() => setEditorChoice(item)}
            onStatus={(status) => onStatus("missions", item.id, status)}
            saving={saving === `missions-${item.id}`}
            onDelete={() => onDelete("missions", item.id, item.name)}
            deleteSaving={saving === `missions-delete-${item.id}`}
            canManage={canManage}
          />
        )}
      />
      {migrationNotice ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
          role="status"
        >
          {migrationNotice.message}
        </div>
      ) : null}
      {legacyActiveMissionCount > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/25">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-amber-950 dark:text-amber-100">
                Активные задания старого формата: {legacyActiveMissionCount}
              </h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-900 dark:text-amber-200">
                Перевод создаст v2-контракт мастера без смены ID, статуса,
                сроков, наград, лимитов и даты активации. Накопленный прогресс
                не будет пересчитан или выдан повторно.
              </p>
            </div>
            {canManage ? (
              <button
                type="button"
                className={`${primaryButtonClass} shrink-0`}
                onClick={() => setMigrationConfirmation(true)}
                disabled={saving === "missions-migrate-wizard"}
              >
                Перевести в мастер
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      {migrationConfirmation ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-zinc-950/55 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setMigrationConfirmation(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mission-migration-title"
            className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2
              id="mission-migration-title"
              className="text-xl font-black text-zinc-950 dark:text-white"
            >
              Перевести активные задания в мастер?
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Будут перенесены все {legacyActiveMissionCount} активных заданий
              старого формата. Сначала сервер проверит, что каждое условие можно
              выразить через мастер; при любой несовместимости ничего не
              изменится.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className={smallButtonClass}
                onClick={() => setMigrationConfirmation(false)}
                disabled={saving === "missions-migrate-wizard"}
              >
                Отмена
              </button>
              <button
                type="button"
                className={primaryButtonClass}
                disabled={saving === "missions-migrate-wizard"}
                onClick={() => {
                  void onMigrateActive().then((migrated) => {
                    if (migrated) setMigrationConfirmation(false);
                  });
                }}
              >
                {saving === "missions-migrate-wizard"
                  ? "Проверяем и переносим…"
                  : "Подтвердить перенос"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {editorChoice ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-zinc-950/55 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setEditorChoice(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mission-editor-choice-title"
            className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2
              id="mission-editor-choice-title"
              className="text-xl font-black text-zinc-950 dark:text-white"
            >
              Как редактировать задание?
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              «{editorChoice.name}» открывается в мастере с live-предпросмотром.
            </p>
            <div className="mt-5 grid gap-3">
              {editorChoice.definitionVersion === 2 ? (
                <Link
                  href={`/gamification/missions/wizard?missionId=${encodeURIComponent(editorChoice.id)}`}
                  className={`${primaryButtonClass} justify-center text-center`}
                >
                  Открыть мастер с предпросмотром
                </Link>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  Это правило ещё в контракте v1. Сначала переведите активные
                  задания в мастер — старый редактор больше не используется.
                </div>
              )}
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
                onClick={() => setEditorChoice(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function MissionQuestStepIdSummary({ mission }: { mission: GuestGameMission }) {
  const steps = missionQuestSteps(mission.conditions);

  if (!steps.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        ID шагов задания
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {steps.map((step, index) => (
          <div
            key={step.id || index}
            className="rounded-md border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="font-bold text-cyan-700 dark:text-cyan-300">
              {trackingId("TASKSTEP", `${mission.id}-${step.id || index + 1}`)}
            </p>
            <p className="mt-1 truncate text-zinc-600 dark:text-zinc-300">
              {index + 1}. {step.title}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MissionBusinessRules({
  form,
  missionTemplates,
  tariffSnapshots,
  guestLogCatalog,
  products,
  onChange,
}: {
  form: MissionForm;
  missionTemplates: GuestGameMission[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  products: Product[];
  onChange: (patch: Partial<MissionForm>) => void;
}) {
  return (
    <BusinessRuleSection
      title="Условия выполнения"
      description="Опишите проверяемое поведение гостя простыми правилами. Факты берутся из подготовленных данных Langame."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Тип сессии">
          <select
            className={fieldClass}
            value={form.sessionType}
            onChange={(event) => onChange({ sessionType: event.target.value })}
          >
            <option value="" disabled>
              Выберите тип
            </option>
            {sessionTypeOptions.map((option) => (
              <option key={option.value || "any"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <TariffConditionFields
        snapshots={tariffSnapshots}
        tariffGroupId={form.tariffGroupId}
        tariffPeriodId={form.tariffPeriodId}
        tariffTypeId={form.tariffTypeId}
        onChange={onChange}
      />
      <div className="rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
        <p className="text-sm font-semibold text-zinc-950 dark:text-white">
          Метрика прогресса
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Система считает прогресс по сохраненным фактам гостя: чекины, сессии,
          пополнения, покупки бара и рефералы.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Как считать">
            <select
              className={fieldClass}
              value={form.metricAggregation}
              onChange={(event) =>
                onChange({ metricAggregation: event.target.value })
              }
            >
              <option value="count">Количество действий</option>
              <option value="sum">Сумма, руб</option>
              <option value="duration">Минуты игры</option>
              <option value="distinctDays">Уникальные дни</option>
              <option value="exists">Факт события</option>
            </select>
          </Field>
          <MissionMetricEventField
            value={form.metricEventTypes}
            catalog={guestLogCatalog}
            onChange={(metricEventTypes) => onChange({ metricEventTypes })}
          />
          <Field label="Окна времени">
            <input
              className={fieldClass}
              placeholder="22:00-06:00"
              value={form.metricHours}
              onChange={(event) =>
                onChange({ metricHours: event.target.value })
              }
            />
          </Field>
        </div>
        {missionUsesProductMetric(form) ? (
          <MissionProductMetricSelector
            products={products}
            selectedStoreIds={form.storeIds}
            productIds={form.metricProductIds}
            externalProductIds={form.metricExternalProductIds}
            categoryIds={form.metricCategoryIds}
            categoryNames={form.metricCategoryNames}
            onChange={onChange}
          />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Окно выполнения, дней">
          <input
            className={fieldClass}
            type="number"
            min="1"
            value={form.windowDays}
            onChange={(event) => onChange({ windowDays: event.target.value })}
          />
        </Field>
        <Field label="Минут в сессии">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.minSessionMinutes}
            onChange={(event) =>
              onChange({ minSessionMinutes: event.target.value })
            }
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Минимальная покупка, руб">
          <input
            className={fieldClass}
            type="number"
            min="0"
            value={form.minSpendAmount}
            onChange={(event) =>
              onChange({ minSpendAmount: event.target.value })
            }
          />
        </Field>
        <ToggleField
          label="Только будни"
          checked={form.weekdaysOnly}
          onChange={(weekdaysOnly) => onChange({ weekdaysOnly })}
        />
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-950 dark:text-white">
              Цепочка заданий
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Разбейте задание на понятные гостю шаги. В публичном кабинете они
              будут показаны от первого шага к награде.
            </p>
          </div>
          <ToggleField
            label="Включить цепочку"
            checked={form.questEnabled}
            onChange={(questEnabled) => onChange({ questEnabled })}
          />
        </div>
        {form.questEnabled ? (
          <MissionQuestChainFields
            form={form}
            missionTemplates={missionTemplates}
            onChange={onChange}
          />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <ToggleField
            label="Нужен факт Langame"
            checked={form.requireLangameFact}
            onChange={(requireLangameFact) => onChange({ requireLangameFact })}
          />
          <OptionHelp>
            Задание засчитывается только по подтвержденному сохраненному факту:
            визиту, сессии, чеку, пополнению или другому событию из Langame.
          </OptionHelp>
        </div>
        <ToggleField
          label="Без повтора в тот же день"
          checked={form.denySameDayRepeat}
          onChange={(denySameDayRepeat) => onChange({ denySameDayRepeat })}
        />
        <ToggleField
          label="Подтверждает кассир"
          checked={form.requireCashierConfirmation}
          onChange={(requireCashierConfirmation) =>
            onChange({ requireCashierConfirmation })
          }
        />
      </div>
    </BusinessRuleSection>
  );
}

export function MissionQuestChainFields({
  form,
  missionTemplates,
  onChange,
}: {
  form: MissionForm;
  missionTemplates: GuestGameMission[];
  onChange: (patch: Partial<MissionForm>) => void;
}) {
  const missionTemplateById = new Map(
    missionTemplates.map((mission) => [mission.id, mission]),
  );
  const questSteps = form.questSteps.length
    ? form.questSteps
    : cloneMissionQuestSteps(defaultMissionQuestSteps.slice(0, 1));

  const updateStep = (index: number, patch: Partial<MissionQuestStepForm>) => {
    onChange({
      questSteps: questSteps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...patch } : step,
      ),
    });
  };

  const selectTemplate = (index: number, missionId: string) => {
    const mission = missionTemplateById.get(missionId);
    const step = questSteps[index];

    updateStep(index, {
      missionId,
      title: mission?.name ?? step?.title ?? "",
    });
  };

  const addStep = () =>
    onChange({
      questSteps: [
        ...questSteps,
        {
          id: `step-${Date.now()}-${questSteps.length + 1}`,
          title: `Шаг ${questSteps.length + 1}`,
          missionId: "",
        },
      ],
    });

  const removeStep = (index: number) => {
    const nextSteps = questSteps.filter((_, stepIndex) => stepIndex !== index);

    onChange({
      questSteps: nextSteps.length
        ? nextSteps
        : cloneMissionQuestSteps(defaultMissionQuestSteps.slice(0, 1)),
    });
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <OptionHelp>
          Шаг можно связать с сохраненным заданием-шаблоном или оставить ручной
          подписью. В цепочке сохраняется ссылка на выбранное задание и текст,
          который увидит гость.
        </OptionHelp>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          {questSteps.length} {missionStepCountLabel(questSteps.length)}
        </span>
      </div>
      {questSteps.map((step, index) => {
        const label = `Шаг ${index + 1}`;
        const selectedMission = missionTemplateById.get(step.missionId);

        return (
          <div
            key={step.id || label}
            className="grid gap-3 border-t border-zinc-200 pt-3 first:border-t-0 first:pt-0 dark:border-zinc-800 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]"
          >
            <Field label={`${label}: шаблон`}>
              <select
                className={fieldClass}
                value={step.missionId}
                onChange={(event) => selectTemplate(index, event.target.value)}
              >
                <option value="">
                  {missionTemplates.length
                    ? "Без шаблона"
                    : "Сначала сохраните задание"}
                </option>
                {missionTemplates.map((mission) => (
                  <option key={mission.id} value={mission.id}>
                    {mission.name} · {missionTypeLabel(mission.missionType)}
                  </option>
                ))}
              </select>
              <OptionHelp>
                {selectedMission
                  ? `${selectedMission.xpReward} XP · ${
                      selectedMission.progressTarget ?? 1
                    } ${selectedMission.progressUnit ?? "шаг"}`
                  : "Шаблон необязателен: можно оставить шаг простым текстом."}
              </OptionHelp>
            </Field>
            <Field label={`${label}: подпись для гостя`}>
              <input
                className={fieldClass}
                value={step.title}
                onChange={(event) =>
                  updateStep(index, { title: event.target.value })
                }
              />
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                className={`${smallButtonClass} w-full justify-center lg:h-10`}
                disabled={questSteps.length <= 1}
                onClick={() => removeStep(index)}
              >
                Удалить
              </button>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={smallButtonClass}
          disabled={questSteps.length >= maxMissionQuestSteps}
          onClick={addStep}
        >
          Добавить шаг
        </button>
        <OptionHelp>
          Можно собрать до {maxMissionQuestSteps} шагов из сохраненных шаблонов
          заданий.
        </OptionHelp>
      </div>
    </div>
  );
}

export function missionMetricEventOptions(
  catalog: GuestGameGuestLogCatalog,
  selectedValues: string[],
): GuestLogEventOption[] {
  const options = new Map<string, GuestLogEventOption>();

  for (const option of dryRunEventOptions) {
    options.set(option.value, {
      value: option.value,
      label: option.label,
      description:
        triggerHelpText[option.value] ??
        "Событие игрового модуля или сохраненный факт Langame.",
    });
  }

  for (const option of guestLogEventOptions(catalog, selectedValues)) {
    if (!options.has(option.value)) {
      options.set(option.value, option);
    }
  }

  for (const value of selectedValues) {
    if (!options.has(value)) {
      options.set(value, {
        value,
        label: value,
        description: "Сохраненное значение из правила.",
      });
    }
  }

  return Array.from(options.values());
}

export function MissionMetricEventField({
  value,
  catalog,
  onChange,
}: {
  value: string;
  catalog: GuestGameGuestLogCatalog;
  onChange: (value: string) => void;
}) {
  const selectedValues = csvList(value);
  const options = missionMetricEventOptions(catalog, selectedValues);

  return (
    <Field label="События">
      <select
        className={fieldClass}
        value=""
        onChange={(event) => {
          if (event.target.value) {
            onChange(appendCsvToken(value, event.target.value));
          }
        }}
      >
        <option value="">Выберите событие</option>
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={csvHasToken(value, option.value)}
          >
            {option.label}
          </option>
        ))}
      </select>
      <OptionHelp>
        Можно выбрать несколько событий. Они будут считаться как прогресс
        задания.
      </OptionHelp>
      <SelectedGuestLogEvents
        values={selectedValues}
        options={options}
        emptyLabel="События для прогресса пока не выбраны."
        onRemove={(eventType) => onChange(removeCsvToken(value, eventType))}
      />
    </Field>
  );
}

export type ProductCategoryOption = {
  id: string;
  label: string;
};

export function MissionProductMetricSelector({
  products,
  selectedStoreIds,
  productIds,
  externalProductIds,
  categoryIds,
  categoryNames,
  onChange,
}: {
  products: Product[];
  selectedStoreIds: string[];
  productIds: string;
  externalProductIds: string;
  categoryIds: string;
  categoryNames: string;
  onChange: (patch: Partial<MissionForm>) => void;
}) {
  const [productQuery, setProductQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const selectedProductIds = csvList(productIds);
  const selectedExternalProductIds = csvList(externalProductIds);
  const selectedCategoryIds = csvList(categoryIds);
  const selectedCategoryNames = csvList(categoryNames);
  const availableProducts = useMemo(
    () => filterProductsByMissionStores(products, selectedStoreIds),
    [products, selectedStoreIds],
  );
  const categoryOptions = useMemo(
    () =>
      productCategoryOptions(
        availableProducts,
        selectedCategoryIds,
        selectedCategoryNames,
      ),
    [availableProducts, selectedCategoryIds, selectedCategoryNames],
  );
  const filteredProducts = useMemo(
    () =>
      filterProductsForMission(
        availableProducts,
        productQuery,
        selectedProductIds,
      ).slice(0, 10),
    [availableProducts, productQuery, selectedProductIds],
  );
  const filteredCategories = useMemo(
    () =>
      filterCategoryOptions(
        categoryOptions,
        categoryQuery,
        selectedCategoryIds,
        selectedCategoryNames,
      ).slice(0, 10),
    [
      categoryOptions,
      categoryQuery,
      selectedCategoryIds,
      selectedCategoryNames,
    ],
  );
  const selectedProducts = selectedProductIds.map((id) => ({
    value: id,
    label:
      products.find((product) => product.id === id)?.name ??
      "Сохраненный товар",
  }));
  const selectedCategories = selectedCategoryIds.map((id) => {
    const option = categoryOptions.find((category) => category.id === id);

    return {
      value: id,
      label: option?.label ?? "Сохраненная категория",
    };
  });
  const selectedNameCategories = selectedCategoryNames
    .filter(
      (name) =>
        !selectedCategoryIds.some((id) => {
          const option = categoryOptions.find((category) => category.id === id);
          return option?.label === name;
        }),
    )
    .map((name) => ({ value: name, label: name }));

  function selectProduct(product: Product) {
    onChange({ metricProductIds: appendCsvToken(productIds, product.id) });
    setProductQuery("");
  }

  function selectCategory(category: ProductCategoryOption) {
    onChange({
      metricCategoryIds: appendCsvToken(categoryIds, category.id),
      metricCategoryNames: appendCsvToken(categoryNames, category.label),
    });
    setCategoryQuery("");
  }

  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-950 dark:text-white">
          Товары
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Сначала выберите активный клуб выше, затем найдите один или несколько
          товаров, которые гость должен купить.
        </p>
        <input
          className={fieldClass}
          placeholder="Начните вводить название товара"
          value={productQuery}
          onChange={(event) => setProductQuery(event.target.value)}
        />
        {productQuery.trim() ? (
          <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
            {filteredProducts.length ? (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
                  onClick={() => selectProduct(product)}
                >
                  <span className="block font-semibold text-zinc-950 dark:text-white">
                    {product.name}
                  </span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    {product.article
                      ? `Артикул ${product.article}`
                      : "без артикула"}
                    {product.category?.name
                      ? ` · ${product.category.name}`
                      : ""}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                Товар не найден в ассортименте выбранных клубов.
              </p>
            )}
          </div>
        ) : null}
        <SelectionChips
          items={selectedProducts}
          emptyLabel={
            availableProducts.length
              ? "Конкретные товары не выбраны."
              : selectedStoreIds.length
                ? "В выбранных клубах ассортимент недоступен или пока пуст."
                : "Выберите клуб выше, чтобы искать товары по его ассортименту."
          }
          onRemove={(productId) =>
            onChange({
              metricProductIds: removeCsvToken(productIds, productId),
            })
          }
        />
        {selectedExternalProductIds.length ? (
          <div className="mt-2">
            <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Сохраненные товары Langame
            </p>
            <SelectionChips
              items={selectedExternalProductIds.map((id) => ({
                value: id,
                label: "Сохраненный товар Langame",
              }))}
              emptyLabel=""
              onRemove={(externalId) =>
                onChange({
                  metricExternalProductIds: removeCsvToken(
                    externalProductIds,
                    externalId,
                  ),
                })
              }
            />
          </div>
        ) : null}
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold text-zinc-950 dark:text-white">
          Категории товаров
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Можно выбрать одну или несколько категорий вместо конкретных товаров.
          Тогда засчитается любая покупка из выбранной категории.
        </p>
        <input
          className={fieldClass}
          placeholder="Найти категорию"
          value={categoryQuery}
          onChange={(event) => setCategoryQuery(event.target.value)}
        />
        {categoryQuery.trim() ? (
          <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
            {filteredCategories.length ? (
              filteredCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm font-semibold transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
                  onClick={() => selectCategory(category)}
                >
                  {category.label}
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                Категория не найдена.
              </p>
            )}
          </div>
        ) : null}
        <SelectionChips
          items={[...selectedCategories, ...selectedNameCategories]}
          emptyLabel="Категории не выбраны."
          onRemove={(value) => {
            const option = categoryOptions.find(
              (category) => category.id === value,
            );

            onChange({
              metricCategoryIds: removeCsvToken(categoryIds, value),
              metricCategoryNames: removeCsvToken(
                categoryNames,
                option?.label ?? value,
              ),
            });
          }}
        />
      </div>
    </div>
  );
}

export function filterProductsForMission(
  products: Product[],
  query: string,
  selectedProductIds: string[],
) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return products.filter((product) => {
    if (selectedProductIds.includes(product.id)) {
      return false;
    }

    return [
      product.name,
      product.article,
      product.category?.name,
      product.supplier?.name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalized));
  });
}

export function productCategoryOptions(
  products: Product[],
  selectedCategoryIds: string[],
  selectedCategoryNames: string[],
): ProductCategoryOption[] {
  const map = new Map<string, ProductCategoryOption>();

  for (const product of products) {
    if (product.categoryId && product.category?.name) {
      map.set(product.categoryId, {
        id: product.categoryId,
        label: product.category.name,
      });
    }
  }

  for (const id of selectedCategoryIds) {
    if (!map.has(id)) {
      map.set(id, { id, label: "Сохраненная категория" });
    }
  }

  for (const name of selectedCategoryNames) {
    if (![...map.values()].some((option) => option.label === name)) {
      map.set(`name:${name}`, { id: `name:${name}`, label: name });
    }
  }

  return [...map.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "ru"),
  );
}

export function filterCategoryOptions(
  categories: ProductCategoryOption[],
  query: string,
  selectedCategoryIds: string[],
  selectedCategoryNames: string[],
) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return categories.filter(
    (category) =>
      !selectedCategoryIds.includes(category.id) &&
      !selectedCategoryNames.includes(category.label) &&
      category.label.toLowerCase().includes(normalized),
  );
}

export function missionVisibilitySummary(value: unknown) {
  return missionVisibilityValue(stringRule(value, "visibility", "VISIBLE")) ===
    "HIDDEN"
    ? "скрытое"
    : "видимое";
}

export function missionUsesProductMetric(form: MissionForm) {
  const metricEvents = csvList(form.metricEventTypes);

  return (
    form.progressUnit === "purchase" ||
    form.progressUnit === "rub" ||
    form.missionType === "PRODUCT_PURCHASE" ||
    form.missionType === "BAR_PURCHASE" ||
    form.triggerKind === "PRODUCT_PURCHASE" ||
    form.triggerKind === "BAR_PURCHASE" ||
    metricEvents.some(
      (eventType) =>
        eventType === "PRODUCT_PURCHASE" || eventType === "BAR_PURCHASE",
    ) ||
    csvList(form.metricProductIds).length > 0 ||
    csvList(form.metricExternalProductIds).length > 0 ||
    csvList(form.metricCategoryIds).length > 0 ||
    csvList(form.metricCategoryNames).length > 0
  );
}

export function missionProgressUnitPatch(
  form: MissionForm,
  progressUnit: string,
): Partial<MissionForm> {
  if (progressUnit === "minute") {
    return {
      progressUnit,
      triggerKind: "PLAY_HOUR",
      missionType: "PLAY_HOUR",
      metricAggregation: "duration",
      metricEventTypes: appendCsvTokens(form.metricEventTypes, ["PLAY_HOUR"]),
    };
  }

  if (progressUnit === "purchase") {
    return {
      progressUnit,
      triggerKind: "PRODUCT_PURCHASE",
      missionType: "PRODUCT_PURCHASE",
      metricAggregation: "count",
      metricEventTypes: appendCsvTokens(form.metricEventTypes, [
        "PRODUCT_PURCHASE",
        "BAR_PURCHASE",
      ]),
    };
  }

  if (progressUnit === "rub") {
    return {
      progressUnit,
      triggerKind: "PRODUCT_PURCHASE",
      missionType: "PRODUCT_PURCHASE",
      metricAggregation: "sum",
      metricEventTypes: appendCsvTokens(form.metricEventTypes, [
        "PRODUCT_PURCHASE",
        "BAR_PURCHASE",
      ]),
    };
  }

  return { progressUnit };
}

export function filterProductsByMissionStores(
  products: Product[],
  selectedStoreIds: string[],
) {
  if (!selectedStoreIds.length) {
    return [];
  }

  const storeIds = new Set(selectedStoreIds);

  return products.filter(
    (product) =>
      (product.storeIds?.length ?? 0) === 0 ||
      (product.storeIds ?? []).some((storeId) => storeIds.has(storeId)),
  );
}

export function SelectionChips({
  items,
  emptyLabel,
  onRemove,
}: {
  items: Array<{ value: string; label: string }>;
  emptyLabel: string;
  onRemove: (value: string) => void;
}) {
  if (!items.length) {
    return emptyLabel ? (
      <p className="mt-2 rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {emptyLabel}
      </p>
    ) : null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={`${item.value}-${item.label}`}
          type="button"
          className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-left text-xs font-semibold text-emerald-900 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-200"
          title="Убрать из правила"
          onClick={() => onRemove(item.value)}
        >
          <span className="truncate">{item.label}</span>
          <span aria-hidden="true" className="text-sm leading-none">
            x
          </span>
        </button>
      ))}
    </div>
  );
}

export function missionTypeLabel(value: string) {
  return optionLabel(missionTypeOptions, value);
}

export function missionStepCountLabel(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return "шагов";
  }

  if (lastDigit === 1) {
    return "шаг";
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return "шага";
  }

  return "шагов";
}

export function questRuleSummary(value: unknown) {
  const steps = missionQuestSteps(value);
  const templateCount = steps.filter((step) => step.missionId).length;

  if (!steps.length) {
    return "один шаг";
  }

  return templateCount
    ? `задание: ${steps.length} ${missionStepCountLabel(
        steps.length,
      )}, ${templateCount} шабл.`
    : `задание: ${steps.length} ${missionStepCountLabel(steps.length)}`;
}

export function missionMetricSummary(value: unknown) {
  const metric = metricRule(value);
  const aggregation = stringRule(metric, "aggregation", "count");
  const labels: Record<string, string> = {
    count: "счетчик",
    sum: "сумма",
    duration: "минуты",
    distinctDays: "дни",
    exists: "факт",
  };
  const eventTypes = stringListRule(metric, "eventTypes");

  return eventTypes
    ? `${labels[aggregation] ?? aggregation}: ${eventTypes}`
    : (labels[aggregation] ?? aggregation);
}

export function missionAvailabilitySummary(mission: GuestGameMission) {
  const now = Date.now();
  const from = mission.periodFrom
    ? new Date(mission.periodFrom).getTime()
    : null;
  const to = mission.periodTo ? new Date(mission.periodTo).getTime() : null;

  if (
    mission.status === "ACTIVE" &&
    from &&
    Number.isFinite(from) &&
    from > now
  ) {
    return `начнётся ${formatDate(mission.periodFrom)}`;
  }
  if (mission.status === "ACTIVE" && to && Number.isFinite(to) && to < now) {
    return `период завершён ${formatDate(mission.periodTo)}`;
  }
  if (!mission.periodTo) return "бессрочно";
  return `до ${formatDate(mission.periodTo)}`;
}

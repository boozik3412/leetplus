"use client";

import type {
  SeasonForm,
  RuleTemplateType,
  SeasonLevelStepForm,
  LootBoxCaseRarity,
} from "../shared/types";
import type {
  GuestGameSeason,
  GuestGameLootBox,
  GuestGameStatus,
} from "@/lib/guest-gamification";
import type { GuestAudience } from "@/lib/guests";
import type { Store } from "@/lib/stores";
import type { Product } from "@/lib/products";
import {
  RulesLayout,
  StatusSelect,
  AudienceSelect,
  StoreSelect,
  BudgetField,
  RewardApprovalSelect,
  RuleCard,
  BusinessRuleSection,
} from "../shared/rule-fields";
import {
  primaryButtonClass,
  fieldClass,
  smallButtonClass,
  weekdayPresets,
  dangerButtonClass,
  lootBoxUsageKindLabels,
  lootBoxCaseRarityOptions,
} from "../shared/constants";
import { Field, OptionHelp } from "../shared/ui";
import {
  trackingId,
  sessionTypeLabel,
  stringRule,
  tariffRuleSummary,
  guestLogRuleSummary,
  formatDate,
  formatBudgetAmount,
  numeric,
  seasonStepRewardLabel,
  lootBoxCaseRarity,
  seasonStepRewardDefinition,
  bonusAmountFromRewardLabel,
  lootBoxPrizesToForm,
  optionalNumber,
  arrayRule,
  asRecord,
} from "../shared/helpers";
import {
  defaultBattlePassStepCondition,
  BattlePassStepConditionEditor,
} from "@/components/battle-pass-step-condition-editor";

export const battlePassStepRewardTypeOptions = [
  { value: "", label: "Без награды" },
  {
    value: "BATTLE_PASS_COMPLETION_MARKER",
    label: "Служебный этап (без выдачи)",
  },
  { value: "BONUS_BALANCE", label: "Бонусы Langame" },
  { value: "PROMOCODE", label: "Промокод" },
  { value: "LOOT_BOX", label: "Лутбокс" },
  { value: "ADMIN_OTHER", label: "Иной приз" },
];

export const battlePassStepRewardDeliveryOptions = [
  { value: "AUTO", label: "Автоматическая выдача" },
  { value: "ADMIN", label: "Администратором" },
];

export function SeasonsTab({
  form,
  setForm,
  seasons,
  audiences,
  stores,
  products,
  lootBoxes,
  editingId,
  isFormOpen,
  onSave,
  onEdit,
  onCreateNew,
  onReset,
  onStatus,
  onDelete,
  saving,
  error,
  canManage,
}: {
  form: SeasonForm;
  setForm: (form: SeasonForm) => void;
  seasons: GuestGameSeason[];
  audiences: GuestAudience[];
  stores: Store[];
  products: Product[];
  lootBoxes: GuestGameLootBox[];
  editingId: string | null;
  isFormOpen: boolean;
  onSave: () => Promise<void>;
  onEdit: (season: GuestGameSeason) => void;
  onCreateNew: () => void;
  onReset: () => void;
  onStatus: (
    type: RuleTemplateType,
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  onDelete: (type: RuleTemplateType, id: string, name: string) => Promise<void>;
  saving: string | null;
  error: string | null;
  canManage: boolean;
}) {
  const seasonTitle = form.name.trim();
  const formTitle =
    editingId && seasonTitle
      ? `Редактирование Battle Pass "${seasonTitle}"`
      : editingId
        ? "Редактирование Battle Pass"
        : "Настройка Battle Pass";

  return (
    <RulesLayout
      canManage={canManage}
      formTitle={formTitle}
      formAction={
        !isFormOpen ? (
          <button
            type="button"
            className={`${primaryButtonClass} sm:min-w-52`}
            onClick={onCreateNew}
          >
            Создать новый Battle Pass
          </button>
        ) : undefined
      }
      form={
        isFormOpen ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Название">
                <input
                  className={fieldClass}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </Field>
              <Field label="Статус">
                <StatusSelect
                  value={form.status}
                  onChange={(status) => setForm({ ...form, status })}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Тип сезона">
                <input
                  className={fieldClass}
                  value="Клубный сезон"
                  disabled
                  readOnly
                />
              </Field>
              <AudienceSelect
                audiences={audiences}
                value={form.audienceId}
                onChange={(audienceId) => setForm({ ...form, audienceId })}
              />
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
            <SeasonBusinessRules
              form={form}
              stores={stores}
              products={products}
              lootBoxes={lootBoxes}
              onChange={(patch) => setForm({ ...form, ...patch })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Premium">
                <label className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-800">
                  <input
                    type="checkbox"
                    checked={form.premiumEnabled}
                    onChange={(event) =>
                      setForm({ ...form, premiumEnabled: event.target.checked })
                    }
                  />
                  Включен
                </label>
              </Field>
              <Field label="Upgrade mode">
                <input
                  className={fieldClass}
                  value={form.premiumUpgradeMode}
                  onChange={(event) =>
                    setForm({ ...form, premiumUpgradeMode: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <BudgetField
                value={form.budgetAmount}
                unlimited={form.budgetUnlimited}
                onChange={(patch) => setForm({ ...form, ...patch })}
              />
              <RewardApprovalSelect
                manualApprovalRequired={form.manualApprovalRequired}
                onChange={(manualApprovalRequired) =>
                  setForm({ ...form, manualApprovalRequired })
                }
              />
            </div>
            <Field label="Заметка">
              <textarea
                className={`${fieldClass} min-h-20`}
                value={form.note}
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
              />
            </Field>
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
              >
                {error}
              </div>
            ) : null}
            <button
              type="button"
              className={primaryButtonClass}
              disabled={saving === "season"}
              onClick={onSave}
            >
              {editingId ? "Сохранить" : "Создать Battle Pass"}
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
      listTitle="Созданные правила Battle Pass"
      items={seasons}
      layout="stacked"
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          eyebrow="Сохраненное правило"
          trackingId={trackingId("BP", item.id)}
          title={item.name}
          status={item.status}
          subtitle={`${seasonTypeLabel(item.seasonType)} · ${
            item.premiumEnabled ? "premium" : "free"
          }`}
          meta={[
            item.audience?.name ?? "все гости",
            `тип: ${sessionTypeLabel(stringRule(item.xpRules, "sessionType", ""))}`,
            tariffRuleSummary(item.xpRules),
            guestLogRuleSummary(item.xpRules),
            formatDate(item.periodFrom),
            formatBudgetAmount(item.budgetAmount),
            item.manualApprovalRequired
              ? "выдача: после подтверждения сотрудником"
              : "выдача: автоматически",
          ]}
          details={<BattlePassLevelIdSummary season={item} />}
          onEdit={() => onEdit(item)}
          onStatus={(status) => onStatus("seasons", item.id, status)}
          saving={saving === `seasons-${item.id}`}
          onDelete={() => onDelete("seasons", item.id, item.name)}
          deleteSaving={saving === `seasons-delete-${item.id}`}
          canManage={canManage}
        />
      )}
    />
  );
}

export function BattlePassLevelIdSummary({ season }: { season: GuestGameSeason }) {
  const levels = battlePassLevelRows(season);

  if (!levels.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        ID заданий Battle Pass
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        {levels.slice(0, 9).map((level) => (
          <div
            key={level.id}
            className="rounded-md border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="font-bold text-cyan-700 dark:text-cyan-300">
              {level.id}
            </p>
            <p className="mt-1 truncate font-medium text-zinc-700 dark:text-zinc-200">
              Уровень {level.level}
            </p>
            <p className="truncate text-zinc-500 dark:text-zinc-400">
              {level.label}
              {level.xp !== null ? ` · ${level.xp} XP` : ""}
            </p>
          </div>
        ))}
      </div>
      {levels.length > 9 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Еще уровней: {levels.length - 9}
        </p>
      ) : null}
    </div>
  );
}

export function SeasonBusinessRules({
  form,
  stores,
  products,
  lootBoxes,
  onChange,
}: {
  form: SeasonForm;
  stores: Store[];
  products: Product[];
  lootBoxes: GuestGameLootBox[];
  onChange: (patch: Partial<SeasonForm>) => void;
}) {
  const updateStep = (index: number, patch: Partial<SeasonLevelStepForm>) => {
    onChange({
      levelSteps: form.levelSteps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...patch } : step,
      ),
    });
  };
  const addStep = () => {
    const nextLevel =
      form.levelSteps.reduce(
        (maxLevel, step) => Math.max(maxLevel, numeric(step.level, 0)),
        0,
      ) + 1;
    onChange({
      levelCount: String(Math.max(numeric(form.levelCount, 0), nextLevel)),
      levelSteps: [
        ...form.levelSteps,
        {
          id: nextSeasonStepId(),
          level: String(nextLevel),
          xp: "0",
          title: `Этап ${nextLevel}`,
          condition: `Выполните условие шага ${nextLevel}.`,
          description: "",
          freeReward: "",
          premiumReward: "",
          conditionV2: { ...defaultBattlePassStepCondition },
          triggerKind: "",
          sessionType: "",
          timeWindowMode: "ANY",
          weekdayMode: "ANY",
          selectedWeekdays: weekdayPresets.ANY,
          hourFrom: "10:00",
          hourTo: "16:00",
          tariffGroupId: "",
          tariffPeriodId: "",
          tariffTypeId: "",
          guestLogTypes: "",
          blockedGuestLogTypes: "",
          freeRewardType: "",
          freeRewardAmount: "",
          freeRewardLabel: "",
          freeRewardCode: "",
          freeRewardLootBoxId: "",
          freeRewardLootBoxName: "",
          freeRewardLootBoxRarity: "common",
          freeRewardDelivery: "AUTO",
          premiumRewardType: "",
          premiumRewardAmount: "",
          premiumRewardLabel: "",
          premiumRewardCode: "",
          premiumRewardLootBoxId: "",
          premiumRewardLootBoxName: "",
          premiumRewardLootBoxRarity: "common",
          premiumRewardDelivery: "AUTO",
        },
      ],
    });
  };
  const removeStep = (index: number) => {
    const levelSteps = form.levelSteps.filter(
      (_, stepIndex) => stepIndex !== index,
    );
    onChange({
      levelSteps,
      levelCount: String(Math.max(1, levelSteps.length)),
    });
  };
  const mainRewardStepIndex = form.levelSteps.length - 1;
  const mainRewardStep =
    mainRewardStepIndex >= 0 ? form.levelSteps[mainRewardStepIndex] : null;
  const sortedLevelSteps = form.levelSteps
    .map((step, index) => ({ step, index }))
    .sort((left, right) => {
      const leftLevel = numeric(left.step.level, left.index + 1);
      const rightLevel = numeric(right.step.level, right.index + 1);

      return rightLevel - leftLevel || right.index - left.index;
    });

  return (
    <BusinessRuleSection
      title="Лестница Battle Pass"
      description="Настройте последовательные шаги сезона: каждый следующий шаг станет доступен только после выполнения предыдущего."
    >
      <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4 text-sm leading-6 text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-950/20 dark:text-cyan-100">
        Battle Pass теперь проходит по шагам. Настройте действие для каждого
        шага ниже: первый шаг проверяется первым, второй начнет проверяться
        только после выполнения первого, и так далее.
      </div>

      <BattlePassRewardSummary form={form} lootBoxes={lootBoxes} />

      {mainRewardStep ? (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 ring-1 ring-amber-100 dark:border-amber-500/35 dark:bg-amber-950/20 dark:ring-amber-400/10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-200">
                Главная награда сезона
              </p>
              <h4 className="mt-1 text-sm font-semibold text-zinc-950 dark:text-white">
                Выдается за прохождение последнего шага Battle Pass
              </h4>
              <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                Сейчас это шаг {mainRewardStepIndex + 1}:{" "}
                {mainRewardStep.title?.trim() || "финальный этап"}.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/30">
              Финал
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SeasonStepRewardFields
              title="Главная Free награда"
              prefix="free"
              step={mainRewardStep}
              lootBoxes={lootBoxes}
              onChange={(patch) => updateStep(mainRewardStepIndex, patch)}
            />
            <SeasonStepRewardFields
              title="Главная Premium награда"
              prefix="premium"
              step={mainRewardStep}
              lootBoxes={lootBoxes}
              onChange={(patch) => updateStep(mainRewardStepIndex, patch)}
            />
          </div>
        </div>
      ) : null}

      <div className="space-y-3 rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/35">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">
              Шаги Battle Pass
            </h4>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Каждый шаг можно настроить отдельно: действие для выполнения,
              пояснение и награды для free/premium дорожек.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={smallButtonClass}
              onClick={addStep}
            >
              Добавить шаг
            </button>
          </div>
        </div>
        {sortedLevelSteps.map(({ step, index }) => (
          <div
            key={step.id || `${step.level}-${index}`}
            className="relative space-y-4 rounded-xl border border-t-4 border-zinc-200 border-t-cyan-500 bg-white p-4 shadow-sm ring-1 ring-black/5 dark:border-zinc-700 dark:border-t-cyan-400 dark:bg-zinc-950/70 dark:shadow-black/30 dark:ring-cyan-400/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-cyan-500/30">
                Шаг {step.level.trim() || index + 1}
              </span>
              <button
                type="button"
                className={dangerButtonClass}
                disabled={form.levelSteps.length <= 1}
                onClick={() => removeStep(index)}
              >
                Удалить шаг
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Порядок шага">
                <input
                  className={fieldClass}
                  type="number"
                  min="1"
                  value={step.level}
                  onChange={(event) =>
                    updateStep(index, { level: event.target.value })
                  }
                />
              </Field>
              <Field label="Название этапа">
                <input
                  className={fieldClass}
                  value={step.title}
                  onChange={(event) =>
                    updateStep(index, { title: event.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="Что должен сделать гость">
                <textarea
                  className={`${fieldClass} min-h-[72px] resize-y`}
                  value={step.condition}
                  onChange={(event) =>
                    updateStep(index, { condition: event.target.value })
                  }
                />
              </Field>
              <Field label="Подробное пояснение">
                <textarea
                  className={`${fieldClass} min-h-[72px] resize-y`}
                  value={step.description}
                  onChange={(event) =>
                    updateStep(index, { description: event.target.value })
                  }
                />
              </Field>
            </div>
            <SeasonStepActivationFieldsV2
              step={step}
              storeIds={form.storeIds}
              stores={stores}
              products={products}
              onChange={(patch) => updateStep(index, patch)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <SeasonStepRewardFields
                title="Free награда"
                prefix="free"
                step={step}
                lootBoxes={lootBoxes}
                onChange={(patch) => updateStep(index, patch)}
              />
              <SeasonStepRewardFields
                title="Premium награда"
                prefix="premium"
                step={step}
                lootBoxes={lootBoxes}
                onChange={(patch) => updateStep(index, patch)}
              />
            </div>
          </div>
        ))}
      </div>
    </BusinessRuleSection>
  );
}

export type BattlePassRewardTrackSummary = {
  rewardCount: number;
  lootBoxCount: number;
  linkedLootBoxCount: number;
  minBonus: number;
  expectedBonus: number;
  maxBonus: number;
  fixedRewards: string[];
  unresolved: string[];
};

export function BattlePassRewardSummary({
  form,
  lootBoxes,
}: {
  form: SeasonForm;
  lootBoxes: GuestGameLootBox[];
}) {
  const free = battlePassRewardTrackSummary(form, "free", lootBoxes);
  const premium = battlePassRewardTrackSummary(form, "premium", lootBoxes);
  const tracks = [
    { key: "free", label: "Free-дорожка", summary: free },
    ...(form.premiumEnabled
      ? [{ key: "premium", label: "Premium-дорожка", summary: premium }]
      : []),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/15">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
          Итог за полное прохождение
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          Диапазон учитывает суммы бонусов и все исходы привязанных лутбоксов.
          Остальные призы перечислены отдельно и не переводятся в бонусы или
          рубли.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {tracks.map(({ key, label, summary }) => (
          <div
            key={key}
            className="rounded-lg border border-emerald-200/80 bg-white/80 p-3 dark:border-emerald-500/20 dark:bg-zinc-950/55"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                {label}
              </p>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold uppercase text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                {summary.rewardCount} наград
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <BattlePassRewardMetric
                label="Минимум"
                value={`${formatRewardNumber(summary.minBonus)} бонусов`}
              />
              <BattlePassRewardMetric
                label="Ожидаемо"
                value={`${formatRewardNumber(summary.expectedBonus)} бонусов`}
              />
              <BattlePassRewardMetric
                label="Максимум"
                value={`${formatRewardNumber(summary.maxBonus)} бонусов`}
              />
            </div>
            {summary.lootBoxCount ? (
              <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
                Лутбоксы: {summary.linkedLootBoxCount} из {summary.lootBoxCount}{" "}
                привязаны к таблицам призов.
              </p>
            ) : null}
            {summary.fixedRewards.length ? (
              <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                Другие награды: {summary.fixedRewards.join(", ")}.
              </p>
            ) : null}
            {summary.unresolved.length ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/25 dark:text-amber-100">
                Нельзя посчитать: {summary.unresolved.join("; ")}.
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BattlePassRewardMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-zinc-100 px-2 py-2 dark:bg-zinc-900">
      <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 break-words text-xs font-semibold text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

export function SeasonStepActivationFieldsV2({
  step,
  storeIds,
  stores,
  products,
  onChange,
}: {
  step: SeasonLevelStepForm;
  storeIds: string[];
  stores: Store[];
  products: Product[];
  onChange: (patch: Partial<SeasonLevelStepForm>) => void;
}) {
  return (
    <BattlePassStepConditionEditor
      value={step.conditionV2 ?? defaultBattlePassStepCondition}
      storeIds={storeIds}
      stores={stores}
      products={products}
      onChange={(conditionV2) => onChange({ conditionV2 })}
    />
  );
}

export function SeasonStepRewardFields({
  title,
  prefix,
  step,
  lootBoxes,
  onChange,
}: {
  title: string;
  prefix: "free" | "premium";
  step: SeasonLevelStepForm;
  lootBoxes: GuestGameLootBox[];
  onChange: (patch: Partial<SeasonLevelStepForm>) => void;
}) {
  const typeKey = `${prefix}RewardType` as const;
  const amountKey = `${prefix}RewardAmount` as const;
  const labelKey = `${prefix}RewardLabel` as const;
  const codeKey = `${prefix}RewardCode` as const;
  const lootBoxIdKey = `${prefix}RewardLootBoxId` as const;
  const lootBoxNameKey = `${prefix}RewardLootBoxName` as const;
  const lootBoxRarityKey = `${prefix}RewardLootBoxRarity` as const;
  const deliveryKey = `${prefix}RewardDelivery` as const;
  const legacyKey = `${prefix}Reward` as const;
  const rewardType =
    step[typeKey] ?? (step[legacyKey]?.trim() ? "ADMIN_OTHER" : "");
  const currentLootBoxId = step[lootBoxIdKey] ?? "";
  const currentLootBox = currentLootBoxId
    ? (lootBoxes.find((lootBox) => lootBox.id === currentLootBoxId) ?? null)
    : null;
  const currentLootBoxIsEligible = currentLootBox
    ? lootBoxCanBeRewardTemplate(currentLootBox)
    : !currentLootBoxId;
  const rewardLootBoxes = lootBoxes.filter(lootBoxCanBeRewardTemplate);

  const patchReward = (patch: Partial<SeasonLevelStepForm>) => {
    const next = { ...step, ...patch };
    const legacyLabel = seasonStepRewardLabel(next, prefix);

    onChange({
      ...patch,
      [legacyKey]: legacyLabel,
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Тип награды">
          <select
            className={fieldClass}
            value={rewardType}
            onChange={(event) =>
              patchReward({
                [typeKey]: event.target.value,
              } as Partial<SeasonLevelStepForm>)
            }
          >
            {battlePassStepRewardTypeOptions.map((option) => (
              <option key={option.value || "none"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Выдача">
          <select
            className={fieldClass}
            value={step[deliveryKey] ?? "AUTO"}
            onChange={(event) =>
              patchReward({
                [deliveryKey]: event.target.value,
              } as Partial<SeasonLevelStepForm>)
            }
          >
            {battlePassStepRewardDeliveryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {rewardType === "BONUS_BALANCE" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Сумма бонусов">
            <input
              className={fieldClass}
              type="number"
              min="0"
              value={step[amountKey] ?? ""}
              onChange={(event) =>
                patchReward({
                  [amountKey]: event.target.value,
                } as Partial<SeasonLevelStepForm>)
              }
            />
          </Field>
          <Field label="Название награды">
            <input
              className={fieldClass}
              value={step[labelKey] ?? ""}
              onChange={(event) =>
                patchReward({
                  [labelKey]: event.target.value,
                } as Partial<SeasonLevelStepForm>)
              }
            />
          </Field>
        </div>
      ) : null}
      {rewardType === "PROMOCODE" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Название промокода">
            <input
              className={fieldClass}
              value={step[labelKey] ?? ""}
              onChange={(event) =>
                patchReward({
                  [labelKey]: event.target.value,
                } as Partial<SeasonLevelStepForm>)
              }
            />
          </Field>
          <Field label="Код или префикс">
            <input
              className={fieldClass}
              value={step[codeKey] ?? ""}
              onChange={(event) =>
                patchReward({
                  [codeKey]: event.target.value,
                } as Partial<SeasonLevelStepForm>)
              }
            />
          </Field>
        </div>
      ) : null}
      {rewardType === "LOOT_BOX" ? (
        <div className="space-y-3">
          <Field label="Лутбокс для награды">
            <select
              className={fieldClass}
              value={currentLootBoxIsEligible ? currentLootBoxId : ""}
              onChange={(event) => {
                const selectedLootBox =
                  rewardLootBoxes.find(
                    (lootBox) => lootBox.id === event.target.value,
                  ) ?? null;

                patchReward({
                  [lootBoxIdKey]: selectedLootBox?.id ?? "",
                  [lootBoxNameKey]:
                    selectedLootBox?.name ?? step[lootBoxNameKey] ?? "",
                  [lootBoxRarityKey]: selectedLootBox
                    ? lootBoxCaseRarity(selectedLootBox.probabilityRules)
                    : (step[lootBoxRarityKey] ?? "common"),
                  [labelKey]: selectedLootBox?.name ?? step[labelKey] ?? "",
                } as Partial<SeasonLevelStepForm>);
              }}
            >
              <option value="">Выберите конкретный лутбокс</option>
              {rewardLootBoxes.map((lootBox) => (
                <option key={lootBox.id} value={lootBox.id}>
                  {lootBox.name} · {lootBoxUsageKindLabels[lootBox.usageKind]}
                </option>
              ))}
            </select>
            {!currentLootBoxIsEligible ? (
              <p
                role="alert"
                className="mt-2 text-xs font-semibold text-red-600 dark:text-red-300"
              >
                Ранее выбранный лутбокс «{currentLootBox?.name ?? "недоступен"}»
                работает только на витрине. Выберите подарочный лутбокс или
                лутбокс с режимом «Витрина + подарок».
              </p>
            ) : null}
            <OptionHelp>
              Для награды доступны только активные подарочные лутбоксы и
              лутбоксы с режимом «Витрина + подарок». Их таблица призов будет
              участвовать в расчете минимальной, ожидаемой и максимальной
              награды Battle Pass.
            </OptionHelp>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Название награды">
              <input
                className={fieldClass}
                value={step[lootBoxNameKey] ?? ""}
                onChange={(event) =>
                  patchReward({
                    [lootBoxIdKey]: "",
                    [lootBoxNameKey]: event.target.value,
                  } as Partial<SeasonLevelStepForm>)
                }
              />
            </Field>
            <Field label="Качество кейса">
              <select
                className={fieldClass}
                value={step[lootBoxRarityKey] ?? "common"}
                onChange={(event) =>
                  patchReward({
                    [lootBoxRarityKey]: event.target.value as LootBoxCaseRarity,
                  } as Partial<SeasonLevelStepForm>)
                }
              >
                {lootBoxCaseRarityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      ) : null}
      {rewardType === "ADMIN_OTHER" ? (
        <Field label="Что выдать">
          <input
            className={fieldClass}
            value={step[labelKey] ?? step[legacyKey] ?? ""}
            onChange={(event) =>
              patchReward({
                [labelKey]: event.target.value,
              } as Partial<SeasonLevelStepForm>)
            }
          />
        </Field>
      ) : null}
      {rewardType === "BATTLE_PASS_COMPLETION_MARKER" ? (
        <Field label="Название этапа в истории">
          <input
            className={fieldClass}
            value={step[labelKey] ?? step[legacyKey] ?? ""}
            onChange={(event) =>
              patchReward({
                [labelKey]: event.target.value,
              } as Partial<SeasonLevelStepForm>)
            }
          />
          <OptionHelp>
            Этап будет отмечен как полученный сразу после выполнения, без
            отдельной выдачи и без уведомления о неполученной награде.
          </OptionHelp>
        </Field>
      ) : null}
    </div>
  );
}

export function battlePassRewardTrackSummary(
  form: SeasonForm,
  track: "free" | "premium",
  lootBoxes: GuestGameLootBox[],
): BattlePassRewardTrackSummary {
  const lootBoxesById = new Map(
    lootBoxes.map((lootBox) => [lootBox.id, lootBox]),
  );
  const summary: BattlePassRewardTrackSummary = {
    rewardCount: 0,
    lootBoxCount: 0,
    linkedLootBoxCount: 0,
    minBonus: 0,
    expectedBonus: 0,
    maxBonus: 0,
    fixedRewards: [],
    unresolved: [],
  };

  for (const step of form.levelSteps) {
    const definition = seasonStepRewardDefinition(step, track);

    if (!definition) {
      continue;
    }

    summary.rewardCount += 1;

    if (definition.type === "BONUS_BALANCE") {
      const amount =
        definition.amount ?? bonusAmountFromRewardLabel(definition.label);

      if (amount == null) {
        summary.unresolved.push(
          `${definition.label}: не указана сумма бонусов`,
        );
        continue;
      }

      summary.minBonus += amount;
      summary.expectedBonus += amount;
      summary.maxBonus += amount;
      continue;
    }

    if (definition.type !== "LOOT_BOX") {
      summary.fixedRewards.push(definition.label);
      continue;
    }

    summary.lootBoxCount += 1;
    const rewardLootBox =
      "lootBox" in definition ? definition.lootBox : undefined;
    const linkedLootBoxId = rewardLootBox?.id ?? null;
    const linkedLootBox = linkedLootBoxId
      ? lootBoxesById.get(linkedLootBoxId)
      : null;

    if (!linkedLootBox || !lootBoxCanBeRewardTemplate(linkedLootBox)) {
      summary.unresolved.push(
        `${definition.label}: выберите активный подарочный лутбокс`,
      );
      continue;
    }

    const prizes = lootBoxPrizesToForm(linkedLootBox.probabilityRules, {
      rewardType: linkedLootBox.rewardType,
      rewardAmount: String(linkedLootBox.rewardAmount ?? 0),
      rewardLabel: linkedLootBox.rewardLabel ?? linkedLootBox.name,
    }).filter((prize) => numeric(prize.chancePercent, 0) > 0);
    const totalWeight = prizes.reduce(
      (total, prize) => total + numeric(prize.chancePercent, 0),
      0,
    );

    if (!prizes.length || totalWeight <= 0) {
      summary.unresolved.push(
        `${definition.label}: нет корректной таблицы призов`,
      );
      continue;
    }

    const outcomes = prizes.map((prize) => {
      if (!battlePassBonusRewardType(prize.rewardType)) {
        return { bonusAmount: 0, weight: numeric(prize.chancePercent, 0) };
      }

      const amount = optionalNumber(prize.rewardAmount);
      return {
        bonusAmount: amount ?? 0,
        weight: numeric(prize.chancePercent, 0),
        missingAmount: amount == null,
      };
    });

    if (outcomes.some((outcome) => outcome.missingAmount)) {
      summary.unresolved.push(
        `${definition.label}: у приза не указана сумма бонусов`,
      );
      continue;
    }

    summary.linkedLootBoxCount += 1;
    summary.minBonus += Math.min(
      ...outcomes.map((outcome) => outcome.bonusAmount),
    );
    summary.maxBonus += Math.max(
      ...outcomes.map((outcome) => outcome.bonusAmount),
    );
    summary.expectedBonus += outcomes.reduce(
      (total, outcome) =>
        total + outcome.bonusAmount * (outcome.weight / totalWeight),
      0,
    );
  }

  summary.fixedRewards = [...new Set(summary.fixedRewards)];
  summary.unresolved = [...new Set(summary.unresolved)];

  return summary;
}

export function battlePassBonusRewardType(value: string | null | undefined) {
  return [
    "BONUS",
    "BONUS_BALANCE",
    "BONUS_POINTS",
    "CASHBACK",
    "CASH_BALANCE",
    "LANGAME_BALANCE",
    "LOYALTY_BONUS",
  ].includes((value ?? "").trim().toUpperCase());
}

export function formatRewardNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

export function lootBoxCanBeRewardTemplate(
  lootBox: Pick<GuestGameLootBox, "status" | "usageKind">,
) {
  return (
    lootBox.status === "ACTIVE" &&
    (lootBox.usageKind === "REWARD_TEMPLATE" || lootBox.usageKind === "BOTH")
  );
}

export function nextSeasonStepId() {
  return `level-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function seasonTypeLabel(value: string) {
  return value === "CLUB_SEASON" ? "Клубный сезон" : value || "Клубный сезон";
}

export function battlePassLevelRows(season: GuestGameSeason) {
  return arrayRule(season.levels).map((item, index) => {
    const record = asRecord(item);
    const levelValue = Number(record.level);
    const xpValue = Number(record.xp);
    const level = Number.isFinite(levelValue)
      ? Math.trunc(levelValue)
      : index + 1;
    const rewardLabel = String(
      record.freeReward ??
        record.premiumReward ??
        record.reward ??
        `Уровень ${level}`,
    ).trim();

    return {
      id: trackingId(`BP${String(level).padStart(2, "0")}`, season.id),
      level,
      xp: Number.isFinite(xpValue) ? Math.trunc(xpValue) : null,
      label: rewardLabel || `Уровень ${level}`,
    };
  });
}

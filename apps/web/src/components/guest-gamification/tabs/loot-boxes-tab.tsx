"use client";

import type {
  LootBoxTimeWindowMode,
  LootBoxWeekdayMode,
  LootBoxPeriodicLimitPeriod,
  LootBoxForm,
  RuleTemplateType,
  LootBoxCaseRarity,
  LootBoxPrizeForm,
  GuestLogBusinessPreset,
} from "../shared/types";
import {
  rewardTypeOptions,
  primaryButtonClass,
  fieldClass,
  lootBoxCaseRarityOptions,
  triggerHelpText,
  sessionTypeOptions,
  smallButtonClass,
  lootBoxUsageKindLabels,
  weekdayPresets,
  weekdayOptions,
} from "../shared/constants";
import type {
  GuestGameLootBox,
  GuestGameTariffSnapshotEndpoint,
  GuestGameGuestLogCatalog,
  GuestGameStatus,
} from "@/lib/guest-gamification";
import type { GuestAudience } from "@/lib/guests";
import type { Store } from "@/lib/stores";
import { useState, useMemo, useRef, useEffect } from "react";
import {
  RulesLayout,
  RuleCommonFields,
  StoreSelect,
  RuleCard,
  BusinessRuleSection,
  TariffConditionFields,
  SelectedGuestLogEvents,
} from "../shared/rule-fields";
import { FormSection, Field, OptionHelp, OptionSelect } from "../shared/ui";
import {
  HourlySessionSourceNote,
} from "@/components/hourly-session-source-note";
import {
  trackingId,
  optionLabel,
  rewardTypeLabelFromValue,
  sessionTypeLabel,
  tariffRuleSummary,
  guestLogRuleSummary,
  formatBudgetAmount,
  lootBoxPeriodicLimitPeriod,
  sortWeekdays,
  numeric,
  formatChanceNumber,
  lootBoxPrizesToForm,
  csvList,
  guestLogEventOptions,
  guestLogBusinessPresets,
  appendCsvToken,
  removeCsvToken,
  appendCsvTokens,
  csvHasToken,
  formatDate,
  primaryLootBoxPrize,
} from "../shared/helpers";
import { fetchJson } from "../shared/api";
import {
  defaultLootBoxPrizeIconKey,
  LootBoxPrizeVisual,
  lootBoxPrizeVisualModeOptions,
  type LootBoxPrizeVisualMode,
  lootBoxPrizeIconOptions,
  type LootBoxPrizeIconKey,
  normalizeLootBoxPrizeColor,
  lootBoxPrizeCardColorStyle,
  defaultLootBoxPrizeColors,
} from "@/components/lootbox-prize-visual";
import Link from "next/link";

export const lootBoxTriggerOptions = [
  { value: "SESSION_START", label: "Старт сессии" },
  { value: "APP_OPEN", label: "Открытие приложения" },
  { value: "CHECK_IN", label: "Чекин в клубе" },
  { value: "VISIT", label: "Визит в клуб" },
  { value: "PLAY_HOUR", label: "Час игры" },
  { value: "BAR_PURCHASE", label: "Покупка в баре" },
  { value: "PRODUCT_PURCHASE", label: "Товарная покупка" },
  { value: "BALANCE_TOPUP", label: "Пополнение баланса" },
  { value: "GUEST_LOG", label: "Событие Langame" },
  { value: "REFERRAL_ACCEPTED", label: "Реферал принят" },
  { value: "REPEAT_VISIT", label: "Повторный визит" },
  { value: "MISSION_COMPLETED", label: "Задание выполнено" },
];

export const lootBoxSegmentOptions = [
  { value: "", label: "Все гости" },
  { value: "quiet_hours", label: "Тихие часы" },
  { value: "new_guests", label: "Новые гости" },
  { value: "regular_guests", label: "Постоянные гости" },
  { value: "returning_guests", label: "Вернувшиеся гости" },
  { value: "vip_guests", label: "VIP / активные" },
  { value: "birthday", label: "День рождения" },
  { value: "referral", label: "Реферальные гости" },
];

export const lootBoxTimeWindowOptions: Array<{
  value: LootBoxTimeWindowMode;
  label: string;
}> = [
  { value: "ANY", label: "Любое время" },
  { value: "QUIET_HOURS", label: "Тихие часы" },
  { value: "CUSTOM", label: "Свое окно" },
];

export const lootBoxWeekdayOptions: Array<{
  value: LootBoxWeekdayMode;
  label: string;
}> = [
  { value: "ANY", label: "Любой день" },
  { value: "WEEKDAYS", label: "Будни" },
  { value: "WEEKENDS", label: "Выходные" },
  { value: "CUSTOM", label: "Выбрать дни" },
];

export const lootBoxPeriodicLimitOptions: Array<{
  value: LootBoxPeriodicLimitPeriod;
  label: string;
}> = [
  { value: "DAILY", label: "Ежедневный" },
  { value: "WEEKLY", label: "Еженедельный" },
  { value: "MONTHLY", label: "Ежемесячный" },
];

export const audienceHelpText: Record<string, string> = {
  "": "Правило доступно всем гостям выбранных клубов, если остальные условия совпали.",
  quiet_hours:
    "Сценарий для загрузки непиковых часов. Обычно используется вместе с временным окном.",
  new_guests:
    "Для гостей, которые только начинают взаимодействовать с клубом или игровым модулем.",
  regular_guests:
    "Для постоянных гостей с регулярной активностью и повторными визитами.",
  returning_guests:
    "Для гостей, которых нужно вернуть после паузы или долгого отсутствия.",
  vip_guests:
    "Для самых активных или ценных гостей, которым можно давать отдельные условия.",
  birthday:
    "Для поздравительных сценариев и наград, привязанных к дню рождения.",
  referral:
    "Для гостей, пришедших через приглашение, или для реферальных механик.",
};

export const lootBoxRewardTypeOptions = rewardTypeOptions.filter(
  (option) => !["BALANCE", "BATTLE_PASS_REWARD"].includes(option.value),
);

export function LootBoxesTab({
  form,
  setForm,
  lootBoxes,
  audiences,
  stores,
  tariffSnapshots,
  guestLogCatalog,
  editingId,
  isFormOpen,
  formRevealSeq,
  onSave,
  onEdit,
  onCreateNew,
  onReset,
  onStatus,
  onDelete,
  onRestart,
  saving,
  canManage,
}: {
  form: LootBoxForm;
  setForm: (form: LootBoxForm) => void;
  lootBoxes: GuestGameLootBox[];
  audiences: GuestAudience[];
  stores: Store[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  editingId: string | null;
  isFormOpen: boolean;
  formRevealSeq: number;
  onSave: () => Promise<void>;
  onEdit: (lootBox: GuestGameLootBox) => void;
  onCreateNew: () => void;
  onReset: () => void;
  onStatus: (
    type: RuleTemplateType,
    id: string,
    status: GuestGameStatus,
  ) => Promise<void>;
  onDelete: (type: RuleTemplateType, id: string, name: string) => Promise<void>;
  onRestart: (id: string) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  const [lootBoxStoreFilter, setLootBoxStoreFilter] = useState("");
  const [lootBoxTriggerFilter, setLootBoxTriggerFilter] = useState("");
  const filteredLootBoxes = useMemo(
    () =>
      lootBoxes.filter(
        (lootBox) =>
          lootBoxMatchesStoreFilter(lootBox, lootBoxStoreFilter) &&
          (!lootBoxTriggerFilter ||
            lootBox.triggerKind === lootBoxTriggerFilter),
      ),
    [lootBoxes, lootBoxStoreFilter, lootBoxTriggerFilter],
  );
  const lootBoxTitle = form.name.trim();
  const formTitle =
    editingId && lootBoxTitle
      ? `Редактирование лутбокса "${lootBoxTitle}"`
      : editingId
        ? "Редактирование лутбокса"
        : "Настройка лутбокса";

  return (
    <RulesLayout
      canManage={canManage}
      formTitle={formTitle}
      formRevealSeq={formRevealSeq}
      formAction={
        !isFormOpen ? (
          <button
            type="button"
            className={`${primaryButtonClass} sm:min-w-52`}
            onClick={onCreateNew}
          >
            Создать новый лутбокс
          </button>
        ) : undefined
      }
      form={
        isFormOpen ? (
          <div className="space-y-4">
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
              hideRewardFields
              ruleKind="lootBox"
              lootBoxUsageKind={form.usageKind}
              onChange={(patch) => setForm({ ...form, ...patch })}
            />
            <FormSection title="Внешний вид кейса">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Качество кейса">
                  <select
                    className={fieldClass}
                    value={form.caseRarity}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        caseRarity: event.target.value as LootBoxCaseRarity,
                      })
                    }
                  >
                    {lootBoxCaseRarityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <OptionHelp>
                    Меняет только скин лутбокса. Редкость выпавшей награды
                    считается отдельно и не перекрашивает сам кейс.
                  </OptionHelp>
                </Field>
              </div>
            </FormSection>
            <FormSection title="Кому и когда открывать">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Событие для появления">
                  <OptionSelect
                    options={lootBoxTriggerOptions}
                    value={form.triggerKind}
                    preservedLabel="Сохраненное событие"
                    onChange={(triggerKind) =>
                      setForm({ ...form, triggerKind })
                    }
                  />
                  <OptionHelp>
                    {triggerHelpText[form.triggerKind] ??
                      "LeetPlus проверит правило, когда получит событие этого типа."}
                  </OptionHelp>
                </Field>
                <Field label="Аудитория">
                  <OptionSelect
                    options={lootBoxSegmentOptions}
                    value={form.segment}
                    preservedLabel="Сохраненная аудитория"
                    onChange={(segment) => setForm({ ...form, segment })}
                  />
                  <OptionHelp>
                    {audienceHelpText[form.segment] ??
                      "Аудитория ограничивает, каким гостям доступно правило."}
                  </OptionHelp>
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Тип сессии">
                  <select
                    className={fieldClass}
                    value={form.sessionType}
                    onChange={(event) =>
                      setForm({ ...form, sessionType: event.target.value })
                    }
                  >
                    <option value="">Любая</option>
                    {sessionTypeOptions.map((option) => (
                      <option key={option.value || "any"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {form.sessionType === "regular_session" ? (
                    <HourlySessionSourceNote />
                  ) : null}
                </Field>
              </div>
              <StoreSelect
                stores={stores}
                value={form.storeIds}
                onChange={(storeIds) => setForm({ ...form, storeIds })}
              />
            </FormSection>
            <LootBoxBusinessRules
              form={form}
              tariffSnapshots={tariffSnapshots}
              guestLogCatalog={guestLogCatalog}
              onChange={(patch) => setForm({ ...form, ...patch })}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                className={`${primaryButtonClass} sm:min-w-44`}
                disabled={saving === "lootBox"}
                onClick={onSave}
              >
                {editingId ? "Сохранить" : "Создать лутбокс"}
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
          </div>
        ) : null
      }
      listTitle="Созданные правила лутбоксов"
      listSummary={
        <LootBoxRuleFilters
          stores={stores}
          storeId={lootBoxStoreFilter}
          triggerKind={lootBoxTriggerFilter}
          totalCount={lootBoxes.length}
          visibleCount={filteredLootBoxes.length}
          onStoreIdChange={setLootBoxStoreFilter}
          onTriggerKindChange={setLootBoxTriggerFilter}
          onReset={() => {
            setLootBoxStoreFilter("");
            setLootBoxTriggerFilter("");
          }}
        />
      }
      items={filteredLootBoxes}
      layout="stacked"
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          eyebrow="Сохраненное правило"
          trackingId={trackingId("CASE", item.id)}
          title={item.name}
          status={item.status}
          subtitle={`Появляется: ${optionLabel(
            lootBoxTriggerOptions,
            item.triggerKind,
          )} · Награда: ${
            item.rewardLabel ?? rewardTypeLabelFromValue(item.rewardType)
          }`}
          meta={[
            item.audience?.name ?? "все гости",
            optionLabel(lootBoxSegmentOptions, item.segment ?? ""),
            `тип: ${sessionTypeLabel(item.sessionType)}`,
            lootBoxUsageKindLabels[item.usageKind],
            tariffRuleSummary(item.periodRules),
            guestLogRuleSummary(item.periodRules),
            formatBudgetAmount(item.budgetAmount),
          ]}
          details={<LootBoxRulePrizeSummary lootBox={item} />}
          onEdit={() => onEdit(item)}
          onStatus={(status) => onStatus("loot-boxes", item.id, status)}
          saving={saving === `loot-boxes-${item.id}`}
          onDelete={() => onDelete("loot-boxes", item.id, item.name)}
          deleteSaving={saving === `loot-boxes-delete-${item.id}`}
          onRestart={() => onRestart(item.id)}
          restartSaving={saving === `loot-boxes-restart-${item.id}`}
          canManage={canManage}
        />
      )}
    />
  );
}

export function LootBoxBusinessRules({
  form,
  tariffSnapshots,
  guestLogCatalog,
  onChange,
}: {
  form: LootBoxForm;
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  onChange: (patch: Partial<LootBoxForm>) => void;
}) {
  const updatePrizes = (prizes: LootBoxPrizeForm[]) =>
    onChange(lootBoxPrizePatch(form, prizes));
  const isPeriodicLootBox = form.periodicLimitEnabled;

  return (
    <BusinessRuleSection
      title="Правила запуска"
      description="Настройте, когда лутбокс открывается, сколько раз его можно получить и как распределяются награды."
    >
      <LootBoxScheduleFields form={form} onChange={onChange} />
      <TariffConditionFields
        snapshots={tariffSnapshots}
        tariffGroupId={form.tariffGroupId}
        tariffPeriodId={form.tariffPeriodId}
        tariffTypeId={form.tariffTypeId}
        onChange={onChange}
      />
      {form.triggerKind === "GUEST_LOG" ? (
        <GuestLogConditionFields
          guestLogTypes={form.guestLogTypes}
          blockedGuestLogTypes={form.blockedGuestLogTypes}
          catalog={guestLogCatalog}
          onChange={onChange}
        />
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Лимит на одного гостя
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Включите периодичность, если лутбокс можно открывать регулярно, но
            не чаще одного раза за выбранный период.
          </p>
          <label className="mt-3 flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={isPeriodicLootBox}
              onChange={(event) =>
                onChange({
                  periodicLimitEnabled: event.target.checked,
                  periodicLimitPeriod: form.periodicLimitPeriod || "DAILY",
                  perGuestPerWeek: event.target.checked
                    ? form.perGuestPerWeek
                    : form.perGuestPerWeek || "1",
                })
              }
            />
            <span>Периодический?</span>
          </label>
          {isPeriodicLootBox ? (
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Период
              <select
                className={fieldClass}
                value={form.periodicLimitPeriod}
                onChange={(event) =>
                  onChange({
                    periodicLimitPeriod:
                      lootBoxPeriodicLimitPeriod(event.target.value) ?? "DAILY",
                  })
                }
              >
                {lootBoxPeriodicLimitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal leading-5 text-zinc-500 dark:text-zinc-400">
                Один гость сможет открыть этот лутбокс один раз за выбранный
                календарный период. После начала нового периода он снова станет
                доступен.
              </span>
            </label>
          ) : (
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Открытий на гостя в неделю
              <input
                className={fieldClass}
                type="number"
                min="1"
                value={form.perGuestPerWeek}
                onChange={(event) =>
                  onChange({ perGuestPerWeek: event.target.value })
                }
              />
              <span className="mt-1 block text-xs font-normal leading-5 text-zinc-500 dark:text-zinc-400">
                Укажите, сколько раз один гость может открыть этот лутбокс за
                неделю. Для регулярных кейсов включите периодичность выше.
              </span>
            </label>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Общий дневной лимит
            <input
              className={fieldClass}
              type="number"
              min="1"
              value={form.totalPerDay}
              onChange={(event) =>
                onChange({ totalPerDay: event.target.value })
              }
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Сколько всего открытий разрешено в день по этому лутбоксу для всех
            выбранных клубов. Оставьте поле пустым, если общий дневной лимит не
            нужен.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 lg:col-span-2">
          <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Максимальное количество накопленных наград для получения
            <input
              className={fieldClass}
              type="number"
              min="1"
              step="1"
              value={form.maxPendingRewards}
              onChange={(event) =>
                onChange({ maxPendingRewards: event.target.value })
              }
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Сколько неоткрытых кейсов этого лутбокса гость может хранить
            одновременно. После открытия кейса слот освобождается.
          </p>
        </div>
      </div>
      <LootBoxPrizesEditor prizes={form.prizes} onChange={updatePrizes} />
    </BusinessRuleSection>
  );
}

export function LootBoxRuleFilters({
  stores,
  storeId,
  triggerKind,
  totalCount,
  visibleCount,
  onStoreIdChange,
  onTriggerKindChange,
  onReset,
}: {
  stores: Store[];
  storeId: string;
  triggerKind: string;
  totalCount: number;
  visibleCount: number;
  onStoreIdChange: (storeId: string) => void;
  onTriggerKindChange: (triggerKind: string) => void;
  onReset: () => void;
}) {
  const filtersActive = Boolean(storeId || triggerKind);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <Field label="Фильтр по клубу">
          <select
            className={fieldClass}
            value={storeId}
            onChange={(event) => onStoreIdChange(event.target.value)}
          >
            <option value="">Все клубы</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Фильтр по событию">
          <select
            className={fieldClass}
            value={triggerKind}
            onChange={(event) => onTriggerKindChange(event.target.value)}
          >
            <option value="">Все события</option>
            {lootBoxTriggerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className={smallButtonClass}
          disabled={!filtersActive}
          onClick={onReset}
        >
          Сбросить
        </button>
      </div>
      <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Показано {visibleCount} из {totalCount}
      </p>
    </div>
  );
}

export function LootBoxScheduleFields({
  form,
  onChange,
}: {
  form: LootBoxForm;
  onChange: (patch: Partial<LootBoxForm>) => void;
}) {
  const usesTimeWindow = form.timeWindowMode !== "ANY";
  const usesCustomWeekdays = form.weekdayMode === "CUSTOM";
  const selectedWeekdays = form.selectedWeekdays.length
    ? form.selectedWeekdays
    : weekdayPresets.CUSTOM;

  const setWeekdayMode = (weekdayMode: LootBoxWeekdayMode) => {
    onChange({
      weekdayMode,
      weekdaysOnly: weekdayMode === "WEEKDAYS",
      selectedWeekdays:
        weekdayMode === "CUSTOM"
          ? selectedWeekdays
          : weekdayPresets[weekdayMode],
    });
  };
  const toggleWeekday = (weekday: number) => {
    const next = selectedWeekdays.includes(weekday)
      ? selectedWeekdays.filter((item) => item !== weekday)
      : [...selectedWeekdays, weekday];

    onChange({
      weekdayMode: "CUSTOM",
      weekdaysOnly: false,
      selectedWeekdays: sortWeekdays(next),
    });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Когда показывать">
          <select
            className={fieldClass}
            value={form.timeWindowMode}
            onChange={(event) => {
              const timeWindowMode = event.target
                .value as LootBoxTimeWindowMode;

              onChange({
                timeWindowMode,
                quietHoursEnabled: timeWindowMode !== "ANY",
              });
            }}
          >
            {lootBoxTimeWindowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <OptionHelp>
            {form.timeWindowMode === "ANY"
              ? "Лутбокс может появиться в любое время, если остальные условия совпали."
              : form.timeWindowMode === "QUIET_HOURS"
                ? "Сценарий для загрузки непиковых часов. Ниже задайте окно тихих часов."
                : "Задайте собственный временной интервал для появления лутбокса."}
          </OptionHelp>
        </Field>
        <Field label="По каким дням">
          <select
            className={fieldClass}
            value={form.weekdayMode}
            onChange={(event) =>
              setWeekdayMode(event.target.value as LootBoxWeekdayMode)
            }
          >
            {lootBoxWeekdayOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <OptionHelp>
            {form.weekdayMode === "ANY"
              ? "День недели не ограничивает появление лутбокса."
              : form.weekdayMode === "WEEKDAYS"
                ? "Лутбокс доступен с понедельника по пятницу."
                : form.weekdayMode === "WEEKENDS"
                  ? "Лутбокс доступен только в субботу и воскресенье."
                  : "Отметьте конкретные дни, когда лутбокс может появиться."}
          </OptionHelp>
        </Field>
      </div>
      {usesTimeWindow ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Начало окна">
            <input
              className={fieldClass}
              type="time"
              value={form.hourFrom}
              onChange={(event) => onChange({ hourFrom: event.target.value })}
            />
          </Field>
          <Field label="Конец окна">
            <input
              className={fieldClass}
              type="time"
              value={form.hourTo}
              onChange={(event) => onChange({ hourTo: event.target.value })}
            />
          </Field>
        </div>
      ) : null}
      {usesCustomWeekdays ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {weekdayOptions.map((weekday) => {
            const active = selectedWeekdays.includes(weekday.value);

            return (
              <button
                key={weekday.value}
                type="button"
                className={[
                  "rounded-lg border px-3 py-2 text-xs font-bold transition",
                  active
                    ? "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                    : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
                ].join(" ")}
                onClick={() => toggleWeekday(weekday.value)}
              >
                {weekday.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function LootBoxPrizesEditor({
  prizes,
  onChange,
}: {
  prizes: LootBoxPrizeForm[];
  onChange: (prizes: LootBoxPrizeForm[]) => void;
}) {
  const prizesRef = useRef(prizes);
  const [uploadingPrizeId, setUploadingPrizeId] = useState<string | null>(null);
  const [visualError, setVisualError] = useState<string | null>(null);
  useEffect(() => {
    prizesRef.current = prizes;
  }, [prizes]);
  const chanceTotal = prizes.reduce(
    (total, prize) => total + Math.max(0, numeric(prize.chancePercent, 0)),
    0,
  );
  const sortedPrizes = [...prizes].sort(
    (left, right) =>
      numeric(right.chancePercent, 0) - numeric(left.chancePercent, 0),
  );
  const topPrize = sortedPrizes[0] ?? null;
  const chanceDiff = Math.round((100 - chanceTotal) * 100) / 100;
  const isChanceBalanced = Math.abs(chanceDiff) < 0.01;
  const chanceStatus = isChanceBalanced
    ? "Сумма шансов 100%"
    : chanceDiff > 0
      ? `Осталось ${formatChanceNumber(chanceDiff)}%`
      : `Превышение ${formatChanceNumber(Math.abs(chanceDiff))}%`;
  const chanceStatusClass = isChanceBalanced
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";

  const updatePrize = (index: number, patch: Partial<LootBoxPrizeForm>) => {
    onChange(
      prizes.map((prize, prizeIndex) =>
        prizeIndex === index ? { ...prize, ...patch } : prize,
      ),
    );
  };
  const updatePrizeById = (
    prizeId: string,
    patch: Partial<LootBoxPrizeForm>,
  ) => {
    onChange(
      prizesRef.current.map((prize) =>
        prize.id === prizeId ? { ...prize, ...patch } : prize,
      ),
    );
  };
  const uploadPrizeImage = async (prizeId: string, file: File | null) => {
    if (!file) return;
    if (!/^(image\/png|image\/jpeg|image\/webp)$/.test(file.type)) {
      setVisualError("Для приза выберите изображение JPG, PNG или WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setVisualError("Изображение приза должно быть не больше 2 МБ.");
      return;
    }

    setVisualError(null);
    setUploadingPrizeId(prizeId);
    try {
      const body = new FormData();
      body.set("file", file);
      const asset = await fetchJson<{ url?: string }>("/api/guest-game/media", {
        method: "POST",
        body,
      });

      if (!asset.url) {
        throw new Error("Медиахранилище не вернуло адрес изображения.");
      }

      updatePrizeById(prizeId, {
        visualMode: "IMAGE",
        imageUrl: asset.url,
      });
    } catch (error) {
      setVisualError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить изображение приза.",
      );
    } finally {
      setUploadingPrizeId(null);
    }
  };
  const removePrize = (index: number) => {
    if (prizes.length <= 1) {
      return;
    }

    onChange(prizes.filter((_, prizeIndex) => prizeIndex !== index));
  };
  const addPrize = () =>
    onChange([
      ...prizes,
      {
        id: `prize-${Date.now()}-${prizes.length + 1}`,
        rewardType: "BONUS_BALANCE",
        rewardAmount: "50",
        rewardLabel: "Новый приз",
        chancePercent: "0",
        noBonus: false,
        visualMode: "AUTO",
        iconKey: "coins",
        imageUrl: "",
        borderColor: "",
        textColor: "",
        backgroundColor: "",
      },
    ]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-950 dark:text-white">
            Призы и вероятности
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Добавьте несколько возможных наград. При открытии лутбокса LeetPlus
            выберет один приз по указанным шансам.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={[
              "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
              chanceStatusClass,
            ].join(" ")}
          >
            {chanceStatus}
          </span>
          <button
            type="button"
            className={smallButtonClass}
            title="Шансы выпада сохранятся пропорционально установленным текущим призам"
            onClick={() => onChange(normalizeLootBoxPrizeChances(prizes))}
          >
            Настроить вероятности автоматически
          </button>
          <button type="button" className={smallButtonClass} onClick={addPrize}>
            Добавить приз
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Варианты наград
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {prizes.length === 1 ? "1 приз" : `${prizes.length} призов`}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Самый частый приз
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {topPrize?.rewardLabel || "Не задан"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Итоговая сумма
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {formatChanceNumber(chanceTotal)}%
            </p>
          </div>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          {sortedPrizes.map((prize, index) => {
            const chance = Math.max(0, numeric(prize.chancePercent, 0));

            return (
              <div
                key={prize.id}
                className={[
                  "h-full",
                  index % 4 === 0
                    ? "bg-cyan-500"
                    : index % 4 === 1
                      ? "bg-emerald-500"
                      : index % 4 === 2
                        ? "bg-amber-500"
                        : "bg-fuchsia-500",
                ].join(" ")}
                style={{ width: `${chance}%` }}
                title={`${prize.rewardLabel}: ${formatChanceNumber(chance)}%`}
              />
            );
          })}
        </div>
        {!isChanceBalanced ? (
          <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-200">
            Сумма должна быть 100%. Сейчас шанс будет работать как вес, но
            оператору проще проверять шаблон, когда проценты выровнены.
          </p>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {prizes.map((prize, index) => (
          <div
            key={prize.id}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
          >
            <div className="grid gap-2 lg:grid-cols-[minmax(150px,1fr)_minmax(110px,0.6fr)_minmax(190px,1.2fr)_minmax(110px,0.55fr)_auto] lg:items-end">
              <Field label="Тип награды">
                <OptionSelect
                  options={lootBoxRewardTypeOptions}
                  value={prize.rewardType}
                  preservedLabel="Сохраненный тип награды"
                  onChange={(rewardType) => {
                    const noBonus = rewardType === "MERCH" && prize.noBonus;
                    updatePrize(index, {
                      rewardType,
                      noBonus,
                      ...(noBonus ? { rewardAmount: "0" } : {}),
                      ...(prize.visualMode === "AUTO"
                        ? { iconKey: defaultLootBoxPrizeIconKey(rewardType) }
                        : {}),
                    });
                  }}
                />
              </Field>
              <Field label="Сумма">
                <input
                  className={fieldClass}
                  type="number"
                  min="0"
                  value={prize.rewardAmount}
                  disabled={prize.rewardType === "MERCH" && prize.noBonus}
                  onChange={(event) =>
                    updatePrize(index, { rewardAmount: event.target.value })
                  }
                />
              </Field>
              <Field label="Название приза">
                <input
                  className={fieldClass}
                  value={prize.rewardLabel}
                  onChange={(event) =>
                    updatePrize(index, { rewardLabel: event.target.value })
                  }
                />
              </Field>
              <Field label="Шанс, %">
                <input
                  className={fieldClass}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={prize.chancePercent}
                  onChange={(event) =>
                    updatePrize(index, { chancePercent: event.target.value })
                  }
                />
              </Field>
              <button
                type="button"
                className={`${smallButtonClass} justify-center lg:h-10`}
                disabled={prizes.length <= 1}
                onClick={() => removePrize(index)}
              >
                Удалить
              </button>
            </div>

            {prize.rewardType === "MERCH" ? (
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-cyan-200 bg-cyan-50/70 p-3 text-sm text-zinc-800 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-zinc-100">
                <input
                  className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-600"
                  type="checkbox"
                  checked={prize.noBonus}
                  onChange={(event) =>
                    updatePrize(index, {
                      noBonus: event.target.checked,
                      ...(event.target.checked ? { rewardAmount: "0" } : {}),
                    })
                  }
                />
                <span>
                  <strong className="block">Без бонусов</strong>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    Игрок получит только физический приз. Бонусы на баланс не
                    начисляются.
                  </span>
                </span>
              </label>
            ) : null}

            <div className="mt-3 grid gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 md:grid-cols-[112px_minmax(180px,0.8fr)_minmax(240px,1.2fr)] md:items-end">
              <div className="row-span-2 flex min-h-28 items-center justify-center rounded-lg border border-cyan-200 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_68%)] text-cyan-700 dark:border-cyan-900 dark:text-cyan-200">
                <LootBoxPrizeVisual
                  alt={`Визуал приза ${prize.rewardLabel || index + 1}`}
                  className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_svg]:h-14 [&_svg]:w-14"
                  imageUrl={
                    prize.visualMode === "IMAGE" ? prize.imageUrl : null
                  }
                  iconKey={prize.visualMode === "AUTO" ? null : prize.iconKey}
                  rewardType={prize.rewardType}
                />
              </div>
              <Field label="Визуал награды">
                <OptionSelect
                  options={lootBoxPrizeVisualModeOptions}
                  value={prize.visualMode}
                  preservedLabel="Сохраненный режим визуала"
                  onChange={(visualMode) =>
                    updatePrize(index, {
                      visualMode: visualMode as LootBoxPrizeVisualMode,
                    })
                  }
                />
              </Field>
              {prize.visualMode === "IMAGE" ? (
                <Field label="Собственное изображение">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className={`${fieldClass} min-w-0 flex-1`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploadingPrizeId === prize.id}
                      onChange={(event) => {
                        void uploadPrizeImage(
                          prize.id,
                          event.target.files?.[0] ?? null,
                        );
                        event.target.value = "";
                      }}
                    />
                    {prize.imageUrl ? (
                      <button
                        type="button"
                        className={smallButtonClass}
                        onClick={() => updatePrize(index, { imageUrl: "" })}
                      >
                        Убрать
                      </button>
                    ) : null}
                  </div>
                </Field>
              ) : (
                <Field label="Стандартная иконка">
                  <OptionSelect
                    options={lootBoxPrizeIconOptions}
                    value={
                      prize.visualMode === "AUTO"
                        ? defaultLootBoxPrizeIconKey(prize.rewardType)
                        : prize.iconKey
                    }
                    preservedLabel="Сохраненная иконка"
                    onChange={(iconKey) =>
                      updatePrize(index, {
                        visualMode: "ICON",
                        iconKey: iconKey as LootBoxPrizeIconKey,
                      })
                    }
                  />
                </Field>
              )}
              <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400 md:col-start-2 md:col-end-4">
                {uploadingPrizeId === prize.id
                  ? "Загружаем изображение…"
                  : prize.visualMode === "IMAGE"
                    ? "JPG, PNG или WebP до 2 МБ. Изображение вписывается в карточку без обрезки."
                    : "Иконка используется в рулетке и остаётся резервом, если изображение недоступно."}
              </p>
            </div>

            <div className="mt-3 grid gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-3">
              <LootBoxPrizeColorField
                label="Рамка карточки"
                value={prize.borderColor}
                fallback={
                  lootBoxPrizeEditorRarity(
                    Math.max(0, numeric(prize.chancePercent, 0)),
                  ).colors.borderColor
                }
                onChange={(borderColor) => updatePrize(index, { borderColor })}
              />
              <LootBoxPrizeColorField
                label="Текст карточки"
                value={prize.textColor}
                fallback={
                  lootBoxPrizeEditorRarity(
                    Math.max(0, numeric(prize.chancePercent, 0)),
                  ).colors.textColor
                }
                onChange={(textColor) => updatePrize(index, { textColor })}
              />
              <LootBoxPrizeColorField
                label="Фон карточки"
                value={prize.backgroundColor}
                fallback={
                  lootBoxPrizeEditorRarity(
                    Math.max(0, numeric(prize.chancePercent, 0)),
                  ).colors.backgroundColor
                }
                onChange={(backgroundColor) =>
                  updatePrize(index, { backgroundColor })
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
                <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  Пустое значение использует автоматическую палитру редкости.
                </p>
                {prize.borderColor ||
                prize.textColor ||
                prize.backgroundColor ? (
                  <button
                    type="button"
                    className={smallButtonClass}
                    onClick={() =>
                      updatePrize(index, {
                        borderColor: "",
                        textColor: "",
                        backgroundColor: "",
                      })
                    }
                  >
                    Сбросить цвета
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      {visualError ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {visualError}
        </p>
      ) : null}

      <LootBoxRouletteEditorPreview prizes={prizes} />
    </div>
  );
}

export function LootBoxPrizeColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const selectedColor = normalizeLootBoxPrizeColor(value) ?? fallback;

  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
          type="color"
          value={selectedColor}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <input
          className={fieldClass}
          value={value}
          maxLength={7}
          placeholder={fallback}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          onBlur={() => {
            if (value && !normalizeLootBoxPrizeColor(value)) {
              onChange("");
            }
          }}
        />
      </span>
    </label>
  );
}

export function LootBoxRouletteEditorPreview({
  prizes,
}: {
  prizes: LootBoxPrizeForm[];
}) {
  const stripPrizes = prizes.length
    ? Array.from(
        { length: Math.max(8, prizes.length * 2) },
        (_, index) => prizes[index % prizes.length]!,
      )
    : [];

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-[#03090b] p-4 text-white shadow-inner">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">Предпросмотр рулетки</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Карточки обновляются сразу. В игровом модуле полоса движется, а
            рамка победителя подсвечивается по редкости.
          </p>
        </div>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200">
          Live preview
        </span>
      </div>
      <div className="relative mt-4 overflow-hidden rounded-lg border border-white/10 bg-black/40 p-3">
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px bg-cyan-200 shadow-[0_0_18px_rgba(103,232,249,0.9)]" />
        <div className="flex min-w-max gap-2">
          {stripPrizes.map((prize, index) => {
            const chance = Math.max(0, numeric(prize.chancePercent, 0));
            const rarity = lootBoxPrizeEditorRarity(chance);

            return (
              <div
                key={`${prize.id}-preview-${index}`}
                className={[
                  "grid h-40 w-32 shrink-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-1 rounded-lg border bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_60%)] p-1 shadow-xl",
                  rarity.className,
                ].join(" ")}
                style={{
                  ...lootBoxPrizeCardColorStyle(prize),
                  borderColor:
                    normalizeLootBoxPrizeColor(prize.borderColor) ??
                    rarity.colors.borderColor,
                  color:
                    normalizeLootBoxPrizeColor(prize.textColor) ??
                    rarity.colors.textColor,
                  backgroundColor:
                    normalizeLootBoxPrizeColor(prize.backgroundColor) ??
                    rarity.colors.backgroundColor,
                }}
              >
                <strong className="line-clamp-2 px-1 pt-1 text-xs leading-tight">
                  {prize.rewardLabel || "Награда"}
                </strong>
                <LootBoxPrizeVisual
                  alt=""
                  className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-md border border-current/30 [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_svg]:h-14 [&_svg]:w-14"
                  imageUrl={
                    prize.visualMode === "IMAGE" ? prize.imageUrl : null
                  }
                  iconKey={prize.visualMode === "AUTO" ? null : prize.iconKey}
                  rewardType={prize.rewardType}
                />
                <span className="px-1 pb-1 text-[9px] font-black uppercase tracking-wide opacity-90">
                  {rarity.label} · {formatChanceNumber(chance)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function lootBoxPrizeEditorRarity(chancePercent: number) {
  if (chancePercent <= 1) {
    return {
      label: "Легендарная",
      className: "border-amber-300/80 text-amber-100 shadow-amber-500/20",
      colors: {
        borderColor: "#FCD34D",
        textColor: "#FEF3C7",
        backgroundColor: "#1C1405",
      },
    };
  }
  if (chancePercent <= 4) {
    return {
      label: "Эпическая",
      className: "border-violet-300/80 text-violet-100 shadow-violet-500/20",
      colors: {
        borderColor: "#C4B5FD",
        textColor: "#EDE9FE",
        backgroundColor: "#160D2B",
      },
    };
  }
  if (chancePercent <= 15) {
    return {
      label: "Редкая",
      className: "border-cyan-300/80 text-cyan-100 shadow-cyan-500/20",
      colors: {
        borderColor: defaultLootBoxPrizeColors.borderColor,
        textColor: defaultLootBoxPrizeColors.textColor,
        backgroundColor: defaultLootBoxPrizeColors.backgroundColor,
      },
    };
  }
  return {
    label: "Обычная",
    className: "border-zinc-500/80 text-zinc-100 shadow-black/20",
    colors: {
      borderColor: "#9EB5B7",
      textColor: "#F4F4F5",
      backgroundColor: "#050D10",
    },
  };
}

export function LootBoxRulePrizeSummary({ lootBox }: { lootBox: GuestGameLootBox }) {
  const prizes = lootBoxPrizesToForm(lootBox.probabilityRules, {
    rewardType: lootBox.rewardType,
    rewardAmount: String(lootBox.rewardAmount ?? 0),
    rewardLabel: lootBox.rewardLabel ?? lootBox.name,
  });
  const sortedPrizes = [...prizes].sort(
    (left, right) =>
      numeric(right.chancePercent, 0) - numeric(left.chancePercent, 0),
  );
  const chanceTotal = prizes.reduce(
    (total, prize) => total + Math.max(0, numeric(prize.chancePercent, 0)),
    0,
  );
  const isChanceBalanced = Math.abs(100 - chanceTotal) < 0.01;

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Распределение призов
        </p>
        <span
          className={[
            "rounded-full px-2 py-1 text-[11px] font-bold uppercase",
            isChanceBalanced
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
          ].join(" ")}
        >
          {formatChanceNumber(chanceTotal)}%
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {sortedPrizes.slice(0, 3).map((prize) => {
          const chance = Math.max(0, numeric(prize.chancePercent, 0));

          return (
            <div
              key={prize.id}
              className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-semibold text-zinc-700 dark:text-zinc-200">
                  {prize.rewardLabel}
                </span>
                <span className="shrink-0 font-bold text-zinc-950 dark:text-white">
                  {formatChanceNumber(chance)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                <div
                  className="h-full rounded-full bg-cyan-500"
                  style={{ width: `${Math.max(2, chance)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {sortedPrizes.length > 3 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Еще призов: {sortedPrizes.length - 3}
        </p>
      ) : null}
    </div>
  );
}

export type GuestLogConditionPatch = {
  guestLogTypes?: string;
  blockedGuestLogTypes?: string;
};

export function GuestLogConditionFields({
  guestLogTypes,
  blockedGuestLogTypes,
  catalog,
  onChange,
}: {
  guestLogTypes: string;
  blockedGuestLogTypes: string;
  catalog: GuestGameGuestLogCatalog;
  onChange: (patch: GuestLogConditionPatch) => void;
}) {
  const suggestedTypes = catalog.items.slice(0, 14);
  const allowedValues = csvList(guestLogTypes);
  const blockedValues = csvList(blockedGuestLogTypes);
  const eventOptions = guestLogEventOptions(catalog, [
    ...allowedValues,
    ...blockedValues,
  ]);
  const businessPresets = guestLogBusinessPresets(catalog.items);
  const addAllowedType = (type: string) =>
    onChange({ guestLogTypes: appendCsvToken(guestLogTypes, type) });
  const addBlockedType = (type: string) =>
    onChange({
      blockedGuestLogTypes: appendCsvToken(blockedGuestLogTypes, type),
    });
  const removeAllowedType = (type: string) =>
    onChange({ guestLogTypes: removeCsvToken(guestLogTypes, type) });
  const removeBlockedType = (type: string) =>
    onChange({
      blockedGuestLogTypes: removeCsvToken(blockedGuestLogTypes, type),
    });
  const applyPreset = (preset: GuestLogBusinessPreset) => {
    if (preset.intent === "block") {
      onChange({
        blockedGuestLogTypes: appendCsvTokens(
          blockedGuestLogTypes,
          preset.types,
        ),
      });
      return;
    }

    onChange({ guestLogTypes: appendCsvTokens(guestLogTypes, preset.types) });
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
          События Langame для лутбокса
        </p>
        {catalog.summary.types ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {catalog.summary.types} типов · {catalog.summary.logs} событий ·{" "}
            {catalog.summary.domains} источников
          </p>
        ) : (
          <Link
            href="/sync?includeGuestLogs=1"
            className="text-xs font-semibold text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300"
          >
            Загрузить события из Langame
          </Link>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        Этот блок нужен только для лутбоксов, которые открываются по конкретным
        действиям гостя в Langame: вход, визит, турнир, отмена или другое
        сохраненное событие. Если лутбокс не зависит от таких событий, оставьте
        поля пустыми.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Какие события открывают лутбокс">
          <select
            className={fieldClass}
            value=""
            onChange={(event) => {
              if (event.target.value) {
                addAllowedType(event.target.value);
              }
            }}
          >
            <option value="">Выберите событие</option>
            {eventOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={csvHasToken(guestLogTypes, option.value)}
              >
                {option.label}
              </option>
            ))}
          </select>
          <OptionHelp>
            Выберите действия Langame, после которых гостю можно показать
            лутбокс.
          </OptionHelp>
          <SelectedGuestLogEvents
            values={allowedValues}
            options={eventOptions}
            emptyLabel="Пока не выбрано ни одного события для открытия."
            onRemove={removeAllowedType}
          />
        </Field>
        <Field label="Какие события не засчитывать">
          <select
            className={fieldClass}
            value=""
            onChange={(event) => {
              if (event.target.value) {
                addBlockedType(event.target.value);
              }
            }}
          >
            <option value="">Выберите исключение</option>
            {eventOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={csvHasToken(blockedGuestLogTypes, option.value)}
              >
                {option.label}
              </option>
            ))}
          </select>
          <OptionHelp>
            Добавьте тестовые, ручные или отмененные события, которые не должны
            выдавать награду.
          </OptionHelp>
          <SelectedGuestLogEvents
            values={blockedValues}
            options={eventOptions}
            emptyLabel="Исключения не выбраны."
            onRemove={removeBlockedType}
          />
        </Field>
      </div>
      {businessPresets.length ? (
        <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/70 p-3 dark:border-cyan-950 dark:bg-cyan-950/20">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
              Готовые варианты
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Выберите бизнес-смысл, а технические значения Langame попадут в
              правило автоматически.
            </p>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {businessPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="rounded-lg border border-cyan-200 bg-white p-3 text-left transition hover:border-cyan-400 hover:bg-cyan-50 dark:border-cyan-900/70 dark:bg-zinc-950 dark:hover:border-cyan-600 dark:hover:bg-cyan-950/30"
                onClick={() => applyPreset(preset)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-zinc-950 dark:text-white">
                    {preset.label}
                  </span>
                  <span
                    className={[
                      "shrink-0 rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                      preset.intent === "block"
                        ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
                    ].join(" ")}
                  >
                    {preset.intent === "block" ? "исключить" : "открывает"}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  {preset.description}
                </span>
                <span className="mt-2 block truncate text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
                  {preset.types.slice(0, 4).join(", ")}
                  {preset.types.length > 4
                    ? ` +${preset.types.length - 4}`
                    : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {suggestedTypes.length ? (
        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-950 dark:bg-emerald-950/20">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Найденные события Langame
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {catalog.summary.latestAt
                ? `последний лог ${formatDate(catalog.summary.latestAt)}`
                : "по сохраненным snapshot-фактам"}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestedTypes.map((item) => {
              const domainLabel = item.domains
                .slice(0, 2)
                .map((domain) => domain.domain)
                .join(", ");

              return (
                <span
                  key={item.normalizedType}
                  className="inline-flex max-w-full items-center overflow-hidden rounded-full border border-emerald-200 bg-white text-xs shadow-sm dark:border-emerald-900/70 dark:bg-zinc-950"
                  title={`${item.count} логов${domainLabel ? ` · ${domainLabel}` : ""}`}
                >
                  <button
                    type="button"
                    className="max-w-48 truncate px-2.5 py-1.5 font-semibold text-zinc-800 transition hover:bg-emerald-100 hover:text-emerald-900 dark:text-zinc-100 dark:hover:bg-emerald-950"
                    onClick={() => addAllowedType(item.type)}
                  >
                    {item.type}
                  </button>
                  <span className="border-l border-emerald-100 px-2 py-1.5 font-semibold text-zinc-400 dark:border-emerald-900/70">
                    {item.count}
                  </span>
                  <button
                    type="button"
                    className="border-l border-emerald-100 px-2 py-1.5 font-semibold text-zinc-500 transition hover:bg-red-50 hover:text-red-700 dark:border-emerald-900/70 dark:hover:bg-red-950/30 dark:hover:text-red-200"
                    onClick={() => addBlockedType(item.type)}
                  >
                    запретить
                  </button>
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            Нажатие на название добавляет событие как условие открытия. Кнопка
            `запретить` добавляет событие в список исключений.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function lootBoxMatchesStoreFilter(
  lootBox: Pick<GuestGameLootBox, "storeIds">,
  storeId: string,
) {
  return (
    !storeId || !lootBox.storeIds.length || lootBox.storeIds.includes(storeId)
  );
}

export function lootBoxPrizePatch(
  form: LootBoxForm,
  prizes: LootBoxPrizeForm[],
): Partial<LootBoxForm> {
  const primary = primaryLootBoxPrize({ ...form, prizes });

  return {
    prizes,
    rewardType: primary.rewardType,
    rewardAmount: primary.rewardAmount,
    rewardLabel: primary.rewardLabel,
  };
}

export function normalizeLootBoxPrizeChances(prizes: LootBoxPrizeForm[]) {
  if (!prizes.length) {
    return prizes;
  }

  const rawValues = prizes.map((prize) =>
    Math.max(0, numeric(prize.chancePercent, 0)),
  );
  const total = rawValues.reduce((sum, value) => sum + value, 0);
  const normalized =
    total > 0
      ? rawValues.map((value) => (value / total) * 100)
      : rawValues.map(() => 100 / prizes.length);
  const rounded = normalized.map((value) => Math.round(value * 100) / 100);
  const roundedTotal = rounded.reduce((sum, value) => sum + value, 0);
  const diff = Math.round((100 - roundedTotal) * 100) / 100;
  const lastIndex = rounded.length - 1;

  rounded[lastIndex] = Math.max(
    0,
    Math.round((rounded[lastIndex] + diff) * 100) / 100,
  );

  return prizes.map((prize, index) => ({
    ...prize,
    chancePercent: formatChanceNumber(rounded[index]),
  }));
}

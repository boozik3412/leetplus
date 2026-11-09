"use client";

import { type ReactNode, useRef, useEffect } from "react";
import {
  Field,
  FormSection,
  OptionSelect,
  Panel,
  SectionTitle,
  EmptyState,
  StatusPill,
  OptionHelp,
} from "./ui";
import {
  fieldClass,
  rewardTypeOptions,
  lootBoxUsageKindOptions,
  statusLabels,
  smallButtonClass,
  dangerButtonClass,
  statusOptions,
  rewardStatusOptions,
} from "./constants";
import type {
  GuestGameStatus,
  GuestGameLootBoxUsageKind,
  GuestGameReward,
  GuestGameRewardStatus,
  GuestGameTariffSnapshotEndpoint,
} from "@/lib/guest-gamification";
import type { GuestAudience } from "@/lib/guests";
import type {
  LootBoxForm,
  MissionForm,
  TariffConditionPatch,
  GuestLogEventOption,
} from "./types";
import {
  ruleStatusPillTone,
  rewardGuestFullName,
  formatGuestShortName,
  formatRewardPhone,
  rewardActivityLabel,
  formatDate,
  rewardTypeLabelFromValue,
  rewardRarityLabel,
  rewardRarityPillTone,
  rewardStatusPillTone,
  rewardWalletPillTone,
  formatMoney,
  rewardStatusButtonLabel,
  tariffItemsByEndpoint,
  tariffItemValue,
  tariffItemLabel,
} from "./helpers";
import {
  guestRewardStatusLabel,
  guestRewardFulfillmentLabel,
  guestRewardLifecycleDescription,
  guestRewardActionNotice,
} from "@/lib/guest-reward-status-labels";
import type { Store } from "@/lib/stores";

export function BusinessRuleSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
      <legend className="px-1 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
        {title}
      </legend>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {description}
      </p>
      {children}
    </fieldset>
  );
}

export function RewardApprovalSelect({
  manualApprovalRequired,
  onChange,
}: {
  manualApprovalRequired: boolean;
  onChange: (manualApprovalRequired: boolean) => void;
}) {
  return (
    <Field label="Выдача награды">
      <select
        className={fieldClass}
        value={manualApprovalRequired ? "manual" : "auto"}
        onChange={(event) => onChange(event.target.value === "manual")}
      >
        <option value="auto">Автоматически</option>
        <option value="manual">После подтверждения сотрудником</option>
      </select>
    </Field>
  );
}

export function BudgetField({
  value,
  unlimited,
  onChange,
}: {
  value: string;
  unlimited: boolean;
  onChange: (patch: {
    budgetAmount?: string;
    budgetUnlimited?: boolean;
  }) => void;
}) {
  return (
    <Field label="Бюджет">
      <div className="space-y-2">
        <input
          className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:bg-zinc-900`}
          type="number"
          min="0"
          value={unlimited ? "" : value}
          disabled={unlimited}
          placeholder={unlimited ? "Без ограничений" : undefined}
          onChange={(event) => onChange({ budgetAmount: event.target.value })}
        />
        <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          <span>Безлимит</span>
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(event) =>
              onChange({ budgetUnlimited: event.target.checked })
            }
          />
        </label>
      </div>
    </Field>
  );
}

export function RuleCommonFields({
  status,
  name,
  ruleKind,
  lootBoxUsageKind,
  rewardType,
  rewardAmount,
  rewardLabel,
  audienceId,
  budgetAmount,
  budgetUnlimited,
  manualApprovalRequired,
  note,
  audiences,
  hideRewardFields = false,
  onChange,
}: {
  status: GuestGameStatus;
  name: string;
  ruleKind?: "lootBox" | "mission";
  lootBoxUsageKind?: GuestGameLootBoxUsageKind;
  rewardType: string;
  rewardAmount: string;
  rewardLabel: string;
  audienceId: string;
  budgetAmount: string;
  budgetUnlimited: boolean;
  manualApprovalRequired: boolean;
  note: string;
  audiences: GuestAudience[];
  hideRewardFields?: boolean;
  onChange: (patch: Partial<LootBoxForm & MissionForm>) => void;
}) {
  return (
    <>
      <FormSection title="Основное">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.6fr)]">
          <Field label="Название">
            <input
              className={fieldClass}
              value={name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </Field>
          <Field label="Статус">
            <StatusSelect
              value={status}
              onChange={(next) => onChange({ status: next })}
            />
          </Field>
        </div>
      </FormSection>
      <FormSection
        title={hideRewardFields ? "Бюджет и выдача" : "Награда и бюджет"}
      >
        {hideRewardFields ? (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,260px)]">
            <BudgetField
              value={budgetAmount}
              unlimited={budgetUnlimited}
              onChange={onChange}
            />
            <RewardApprovalSelect
              manualApprovalRequired={manualApprovalRequired}
              onChange={(nextManualApprovalRequired) =>
                onChange({
                  manualApprovalRequired: nextManualApprovalRequired,
                })
              }
            />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Тип награды">
                <OptionSelect
                  options={rewardTypeOptions}
                  value={rewardType}
                  preservedLabel="Сохраненный тип награды"
                  onChange={(nextRewardType) =>
                    onChange({ rewardType: nextRewardType })
                  }
                />
              </Field>
              <Field label="Сумма">
                <input
                  className={fieldClass}
                  type="number"
                  value={rewardAmount}
                  onChange={(event) =>
                    onChange({ rewardAmount: event.target.value })
                  }
                />
              </Field>
              <BudgetField
                value={budgetAmount}
                unlimited={budgetUnlimited}
                onChange={onChange}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,260px)]">
              <Field label="Название награды">
                <input
                  className={fieldClass}
                  value={rewardLabel}
                  onChange={(event) =>
                    onChange({ rewardLabel: event.target.value })
                  }
                />
              </Field>
              <RewardApprovalSelect
                manualApprovalRequired={manualApprovalRequired}
                onChange={(nextManualApprovalRequired) =>
                  onChange({
                    manualApprovalRequired: nextManualApprovalRequired,
                  })
                }
              />
            </div>
          </>
        )}
      </FormSection>
      {ruleKind === "lootBox" ? (
        <FormSection
          title="Назначение лутбокса"
          description="Выберите, где кейс будет использоваться: в витрине игрового модуля, как подарок за другие активности или в обоих сценариях."
        >
          <div className="grid gap-2 md:grid-cols-3">
            {lootBoxUsageKindOptions.map((option) => {
              const active = lootBoxUsageKind === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={[
                    "rounded-lg border p-3 text-left transition",
                    active
                      ? "border-emerald-300 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-600/30"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-200 hover:bg-emerald-50/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20",
                  ].join(" ")}
                  onClick={() =>
                    onChange({
                      usageKind: option.value,
                    } as Partial<LootBoxForm & MissionForm>)
                  }
                >
                  <span className="block text-sm font-bold">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </FormSection>
      ) : null}
      <FormSection title="Аудитория и заметка">
        <AudienceSelect
          audiences={audiences}
          value={audienceId}
          onChange={(next) => onChange({ audienceId: next })}
        />
        <Field label="Заметка">
          <textarea
            className={`${fieldClass} min-h-20`}
            value={note}
            onChange={(event) => onChange({ note: event.target.value })}
          />
        </Field>
      </FormSection>
    </>
  );
}

export function RulesLayout<T>({
  canManage,
  formTitle,
  formAction,
  form,
  listTitle,
  listSummary,
  items,
  renderItem,
  layout = "sidebar",
  formRevealSeq = 0,
}: {
  canManage: boolean;
  formTitle: string;
  formAction?: ReactNode;
  form: ReactNode;
  listTitle: string;
  listSummary?: ReactNode;
  items: T[];
  renderItem: (item: T) => ReactNode;
  layout?: "sidebar" | "stacked";
  /** Bump to bring the form into view (e.g. after «Редактировать» in the list). */
  formRevealSeq?: number;
}) {
  const isStacked = layout === "stacked";
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!formRevealSeq) {
      return;
    }
    const element = formRef.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight / 2) {
      return;
    }
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    element.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [formRevealSeq]);

  return (
    <div
      className={
        canManage
          ? isStacked
            ? "grid gap-5"
            : "grid items-start gap-4 2xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]"
          : "grid gap-5"
      }
    >
      {canManage ? (
        <div ref={formRef} className="scroll-mt-4">
          <Panel title={formTitle} action={formAction}>
            {form}
          </Panel>
        </div>
      ) : null}
      <section className="min-w-0 space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <SectionTitle title={listTitle} />
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {items.length} правил
          </p>
        </div>
        {listSummary ? <div>{listSummary}</div> : null}
        <div
          className={
            isStacked
              ? "grid gap-3 lg:grid-cols-2"
              : "grid max-w-5xl gap-3 lg:grid-cols-2 2xl:max-w-none"
          }
        >
          {items.length ? (
            items.map(renderItem)
          ) : (
            <EmptyState text="Правил пока нет" />
          )}
        </div>
      </section>
    </div>
  );
}

export function RuleCard({
  eyebrow,
  trackingId,
  title,
  status,
  subtitle,
  meta,
  details,
  onEdit,
  onStatus,
  onDelete,
  onRestart,
  saving,
  deleteSaving,
  restartSaving,
  canManage,
}: {
  eyebrow?: string;
  trackingId?: string;
  title: string;
  status: GuestGameStatus;
  subtitle: string;
  meta: string[];
  details?: ReactNode;
  onEdit: () => void;
  onStatus: (status: GuestGameStatus) => Promise<void>;
  onDelete?: () => Promise<void>;
  onRestart?: () => Promise<void>;
  saving: boolean;
  deleteSaving?: boolean;
  restartSaving?: boolean;
  canManage: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          {eyebrow || trackingId ? (
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {eyebrow ? (
                <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                  {eyebrow}
                </p>
              ) : null}
              {trackingId ? (
                <span className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-800 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                  ID {trackingId}
                </span>
              ) : null}
            </div>
          ) : null}
          <h3 className="text-base font-bold text-zinc-950 dark:text-white">
            {title}
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
        </div>
        <StatusPill
          label={statusLabels[status]}
          tone={ruleStatusPillTone(status)}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {meta.map((item) => (
          <span
            key={item}
            className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {item}
          </span>
        ))}
      </div>
      {details ? <div className="mt-3">{details}</div> : null}
      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={smallButtonClass} onClick={onEdit}>
            Редактировать
          </button>
          {onDelete ? (
            <button
              type="button"
              className={dangerButtonClass}
              disabled={saving || restartSaving || deleteSaving}
              onClick={onDelete}
            >
              {deleteSaving ? "Удаление..." : "Удалить"}
            </button>
          ) : null}
          {onRestart ? (
            <button
              type="button"
              className={smallButtonClass}
              disabled={saving || restartSaving || deleteSaving}
              onClick={onRestart}
            >
              {restartSaving ? "Перезапуск..." : "Перезапустить"}
            </button>
          ) : null}
          {statusOptions.map((nextStatus) => (
            <button
              key={nextStatus}
              type="button"
              className={smallButtonClass}
              disabled={
                saving || restartSaving || deleteSaving || status === nextStatus
              }
              onClick={() => onStatus(nextStatus)}
            >
              {statusLabels[nextStatus]}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Только просмотр правила: редактирование и смена статуса недоступны.
        </p>
      )}
    </div>
  );
}

export function RewardRow({
  reward,
  onStatus,
  onEdit,
  saving,
  canApprove,
}: {
  reward: GuestGameReward;
  onStatus: (
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) => Promise<void>;
  onEdit: (reward: GuestGameReward) => void;
  saving: string | null;
  canApprove: boolean;
}) {
  const fullGuestName = rewardGuestFullName(reward);
  const guestName = formatGuestShortName(fullGuestName);
  const guestContact = formatRewardPhone(reward);
  const activity = rewardActivityLabel(reward);
  const storeName = reward.store?.name ?? "любой клуб";
  const qualifiedAt = formatDate(reward.qualifiedAt);
  const rewardTypeLabel = rewardTypeLabelFromValue(reward.rewardType);
  const rarityLabel = rewardRarityLabel(reward);

  return (
    <details className="group rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="cursor-pointer list-none p-4 outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-400 dark:hover:bg-zinc-900/60 [&::-webkit-details-marker]:hidden">
        <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr_0.9fr_0.9fr_0.8fr_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-zinc-400">
              Тип активности
            </p>
            <p className="mt-1 font-semibold text-zinc-950 dark:text-white">
              {activity}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {reward.rewardLabel}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-zinc-400">Клуб</p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {storeName}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-zinc-400">Дата</p>
            <p className="mt-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {qualifiedAt}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-zinc-400">ФИО</p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {guestName}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-zinc-400">Телефон</p>
            <p className="mt-1 font-mono text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {guestContact}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {rarityLabel ? (
              <StatusPill
                label={rarityLabel}
                tone={rewardRarityPillTone(reward.rewardRarity)}
              />
            ) : null}
            <StatusPill
              label={guestRewardStatusLabel(reward)}
              tone={rewardStatusPillTone(reward.status)}
            />
            <StatusPill
              label={guestRewardFulfillmentLabel(reward)}
              tone={rewardWalletPillTone(reward.walletState)}
            />
          </div>
        </div>
      </summary>
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-950 dark:text-white">
                {reward.rewardLabel}
              </h3>
              <StatusPill
                label={guestRewardStatusLabel(reward)}
                tone={rewardStatusPillTone(reward.status)}
              />
              <StatusPill
                label={guestRewardFulfillmentLabel(reward)}
                tone={rewardWalletPillTone(reward.walletState)}
              />
              {rarityLabel ? (
                <StatusPill
                  label={rarityLabel}
                  tone={rewardRarityPillTone(reward.rewardRarity)}
                />
              ) : null}
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {guestName} · телефон: {guestContact}
            </p>
            {fullGuestName !== guestName ? (
              <p className="mt-1 text-xs text-zinc-400">
                Имя в профиле: {fullGuestName}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {rewardTypeLabel} · {formatMoney(reward.rewardAmount)}
              {rarityLabel ? ` · ${rarityLabel}` : ""}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {storeName} · {qualifiedAt}
            </p>
            <p className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
              {guestRewardLifecycleDescription(reward)}
            </p>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                <span className="block font-semibold uppercase text-zinc-400">
                  Код кассиру
                </span>
                <span className="mt-1 block font-mono text-sm font-bold text-zinc-900 dark:text-white">
                  {reward.rewardCode ?? "будет создан при согласовании"}
                </span>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                <span className="block font-semibold uppercase text-zinc-400">
                  Срок
                </span>
                <span className="mt-1 block text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                  {reward.expiresAt
                    ? formatDate(reward.expiresAt)
                    : "без срока"}
                </span>
              </div>
            </div>
            {reward.claimPayload ? (
              <p className="mt-2 rounded-lg border border-dashed border-cyan-300/40 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-200">
                QR-код готов для гостевой страницы. Для ручной выдачи
                используйте короткий код кассиру выше.
              </p>
            ) : null}
          </div>
          {canApprove ? (
            <div className="min-w-0 space-y-2">
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                {guestRewardActionNotice(reward)}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <button
                  type="button"
                  className={smallButtonClass}
                  onClick={() => onEdit(reward)}
                >
                  Редактировать
                </button>
                {rewardStatusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={smallButtonClass}
                    disabled={
                      saving === `reward-${reward.id}` ||
                      reward.status === status
                    }
                    onClick={() => onStatus(reward, status)}
                  >
                    {rewardStatusButtonLabel(reward, status)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 xl:text-right">
              Только просмотр награды
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

export function StatusSelect({
  value,
  onChange,
}: {
  value: GuestGameStatus;
  onChange: (value: GuestGameStatus) => void;
}) {
  return (
    <select
      className={fieldClass}
      value={value}
      onChange={(event) => onChange(event.target.value as GuestGameStatus)}
    >
      {statusOptions.map((status) => (
        <option key={status} value={status}>
          {statusLabels[status]}
        </option>
      ))}
    </select>
  );
}

export function AudienceSelect({
  audiences,
  value,
  onChange,
}: {
  audiences: GuestAudience[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Группа гостей">
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Все гости</option>
        {audiences.map((audience) => (
          <option key={audience.id} value={audience.id}>
            {audience.name} · {audience.guestsCount}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function StoreSelect({
  stores,
  value,
  onChange,
}: {
  stores: Store[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const selectedStores = new Set(value);
  const toggleStore = (storeId: string) => {
    onChange(
      selectedStores.has(storeId)
        ? value.filter((currentStoreId) => currentStoreId !== storeId)
        : [...value, storeId],
    );
  };

  return (
    <Field label="Клубы">
      <div className="grid gap-2 sm:grid-cols-2">
        {stores.length ? (
          stores.map((store) => {
            const selected = selectedStores.has(store.id);

            return (
              <button
                key={store.id}
                type="button"
                aria-pressed={selected}
                className={[
                  "flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
                  selected
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/30",
                ].join(" ")}
                onClick={() => toggleStore(store.id)}
              >
                <span className="min-w-0 truncate font-semibold">
                  {store.name}
                </span>
                <span
                  className={[
                    "shrink-0 rounded-full px-2 py-1 text-[11px] font-bold uppercase",
                    selected
                      ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400",
                  ].join(" ")}
                >
                  {selected ? "выбран" : "выбрать"}
                </span>
              </button>
            );
          })
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            Клубы пока не добавлены.
          </p>
        )}
      </div>
      <OptionHelp>
        Можно выбрать несколько клубов обычными кликами. Повторный клик снимает
        выбор.
      </OptionHelp>
    </Field>
  );
}

export function TariffConditionFields({
  snapshots,
  tariffGroupId,
  tariffPeriodId,
  tariffTypeId,
  onChange,
}: {
  snapshots: GuestGameTariffSnapshotEndpoint[];
  tariffGroupId: string;
  tariffPeriodId: string;
  tariffTypeId: string;
  onChange: (patch: TariffConditionPatch) => void;
}) {
  const groupItems = tariffItemsByEndpoint(snapshots, "tariffsGroups");
  const periodItems = tariffItemsByEndpoint(snapshots, "tariffsTimePeriod");
  const typeItems = tariffItemsByEndpoint(snapshots, "tariffsTypesGroups");
  const hasItems = groupItems.length || periodItems.length || typeItems.length;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
          Тарифные условия Langame
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {hasItems
            ? "Выберите только те условия, которые должны ограничивать правило."
            : "Справочники тарифов пока не заполнены snapshot-синхронизацией."}
        </p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <TariffConditionSelect
          label="Группа тарифа"
          emptyLabel="Любая группа"
          items={groupItems}
          value={tariffGroupId}
          onChange={(value) => onChange({ tariffGroupId: value })}
        />
        <TariffConditionSelect
          label="Период тарифа"
          emptyLabel="Любой период"
          items={periodItems}
          value={tariffPeriodId}
          onChange={(value) => onChange({ tariffPeriodId: value })}
        />
        <TariffConditionSelect
          label="Тип тарифа"
          emptyLabel="Любой тип"
          items={typeItems}
          value={tariffTypeId}
          onChange={(value) => onChange({ tariffTypeId: value })}
        />
      </div>
    </div>
  );
}

export function SelectedGuestLogEvents({
  values,
  options,
  emptyLabel,
  onRemove,
}: {
  values: string[];
  options: GuestLogEventOption[];
  emptyLabel: string;
  onRemove: (value: string) => void;
}) {
  if (!values.length) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => {
        const option = options.find((item) => item.value === value);

        return (
          <button
            key={value}
            type="button"
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-left text-xs font-semibold text-emerald-900 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-200"
            title="Убрать событие из правила"
            onClick={() => onRemove(value)}
          >
            <span className="truncate">{option?.label ?? value}</span>
            <span aria-hidden="true" className="text-sm leading-none">
              x
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TariffConditionSelect({
  label,
  emptyLabel,
  items,
  value,
  onChange,
}: {
  label: string;
  emptyLabel: string;
  items: GuestGameTariffSnapshotEndpoint["typedItems"];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {items.map((item) => (
          <option
            key={`${item.domain}-${tariffItemValue(item)}`}
            value={tariffItemValue(item)}
          >
            {tariffItemLabel(item)}
          </option>
        ))}
      </select>
    </Field>
  );
}

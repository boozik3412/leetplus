"use client";

import type {
  GuestGameRewardStatus,
  GuestGameReward,
  GuestGameProfile,
  GuestGameLootBox,
  GuestGameMission,
  GuestGameSeason,
} from "@/lib/guest-gamification";
import type { RewardForm, RewardRedeemForm } from "../shared/types";
import { type Dispatch, type SetStateAction, useState, useMemo } from "react";
import type { GuestDashboardRow } from "@/lib/guests";
import type { Store } from "@/lib/stores";
import { Field, OptionSelect, SectionTitle, EmptyState } from "../shared/ui";
import {
  fieldClass,
  rewardStatusOptions,
  rewardTypeOptions,
  primaryButtonClass,
  smallButtonClass,
} from "../shared/constants";
import { RewardRow } from "../shared/rule-fields";
import {
  rewardGuestFullName,
  formatRewardPhone,
  formatGuestShortName,
  rewardRarityLabel,
  rewardActivityLabel,
  rewardTypeLabelFromValue,
  formatDate,
} from "../shared/helpers";

export const rewardStatusLabels: Record<GuestGameRewardStatus, string> = {
  PENDING: "к выдаче",
  APPROVED: "согласовано",
  PAID: "выдано",
  CANCELED: "отменено",
  EXPIRED: "сгорело",
};

export type RewardSortMode = "newest" | "oldest";

export function RewardsTab({
  form,
  setForm,
  redeemForm,
  setRedeemForm,
  redeemedReward,
  rewards,
  profiles,
  guests,
  stores,
  lootBoxes,
  missions,
  seasons,
  editingId,
  onSave,
  onEdit,
  onReset,
  onStatus,
  onRedeem,
  saving,
  canApprove,
}: {
  form: RewardForm;
  setForm: (form: RewardForm) => void;
  redeemForm: RewardRedeemForm;
  setRedeemForm: Dispatch<SetStateAction<RewardRedeemForm>>;
  redeemedReward: GuestGameReward | null;
  rewards: GuestGameReward[];
  profiles: GuestGameProfile[];
  guests: GuestDashboardRow[];
  stores: Store[];
  lootBoxes: GuestGameLootBox[];
  missions: GuestGameMission[];
  seasons: GuestGameSeason[];
  editingId: string | null;
  onSave: () => Promise<void>;
  onEdit: (reward: GuestGameReward) => void;
  onReset: () => void;
  onStatus: (
    reward: GuestGameReward,
    status: GuestGameRewardStatus,
  ) => Promise<void>;
  onRedeem: () => Promise<void>;
  saving: string | null;
  canApprove: boolean;
}) {
  const [rewardSearch, setRewardSearch] = useState("");
  const [selectedRewardTypes, setSelectedRewardTypes] = useState<string[]>([]);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [rewardSort, setRewardSort] = useState<RewardSortMode>("newest");
  const filteredRewards = useMemo(() => {
    const query = rewardSearch.trim().toLocaleLowerCase("ru-RU");
    const rewardTypeSet = new Set(selectedRewardTypes);
    const storeSet = new Set(selectedStoreIds);

    return rewards
      .filter((reward) => {
        const matchesType =
          rewardTypeSet.size === 0 || rewardTypeSet.has(reward.rewardType);
        const storeId = reward.store?.id ?? "";
        const matchesStore = storeSet.size === 0 || storeSet.has(storeId);
        const matchesSearch =
          !query ||
          rewardSearchTokens(reward).some((token) => token.includes(query));

        return matchesType && matchesStore && matchesSearch;
      })
      .sort((left, right) => {
        const leftTime = new Date(left.qualifiedAt).getTime();
        const rightTime = new Date(right.qualifiedAt).getTime();

        return rewardSort === "newest"
          ? rightTime - leftTime
          : leftTime - rightTime;
      });
  }, [
    rewardSearch,
    rewardSort,
    rewards,
    selectedRewardTypes,
    selectedStoreIds,
  ]);

  const rewardStoreOptions = useMemo(() => {
    const rewardStoreIds = new Set(
      rewards.map((reward) => reward.store?.id).filter(Boolean),
    );
    const storesWithRewards = stores.filter((store) =>
      rewardStoreIds.has(store.id),
    );

    return storesWithRewards.length ? storesWithRewards : stores;
  }, [rewards, stores]);

  return (
    <div className="space-y-5">
      {canApprove ? (
        <details
          className="group rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          open={editingId ? true : undefined}
        >
          <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 text-left outline-none transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-400 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-zinc-900/60 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <p className="text-base font-bold text-zinc-950 dark:text-white">
                {editingId ? "Редактирование награды" : "Ручная награда"}
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Создать приз вручную или поправить выбранную награду из
                кошелька.
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-bold text-zinc-600 transition group-open:border-emerald-300 group-open:bg-emerald-50 group-open:text-emerald-800 dark:border-zinc-800 dark:text-zinc-300 dark:group-open:border-emerald-800 dark:group-open:bg-emerald-950/40 dark:group-open:text-emerald-100">
              <span className="group-open:hidden">Развернуть</span>
              <span className="hidden group-open:inline">Свернуть</span>
            </span>
          </summary>
          <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
            <div className="space-y-3">
              <Field label="Профиль">
                <select
                  className={fieldClass}
                  value={form.profileId}
                  onChange={(event) =>
                    setForm({ ...form, profileId: event.target.value })
                  }
                >
                  <option value="">Не выбран</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.displayName} · L{profile.level}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Гость без профиля">
                <select
                  className={fieldClass}
                  value={form.guestId}
                  onChange={(event) =>
                    setForm({ ...form, guestId: event.target.value })
                  }
                >
                  <option value="">Не выбран</option>
                  {guests.map((guest) => (
                    <option key={guest.id} value={guest.id}>
                      {guest.displayName} · {guest.contact}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Источник">
                  <select
                    className={fieldClass}
                    value={form.source}
                    onChange={(event) =>
                      setForm({ ...form, source: event.target.value })
                    }
                  >
                    <option value="MANUAL">ручной</option>
                    <option value="CASHIER">кассир</option>
                    <option value="API_IMPORT">импорт</option>
                    <option value="LANGAME">Langame</option>
                  </select>
                </Field>
                <Field label="Статус">
                  <select
                    className={fieldClass}
                    value={form.status}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        status: event.target.value as GuestGameRewardStatus,
                      })
                    }
                  >
                    {rewardStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {rewardStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Тип">
                  <OptionSelect
                    options={rewardTypeOptions}
                    value={form.rewardType}
                    preservedLabel="Сохраненный тип награды"
                    onChange={(rewardType) => setForm({ ...form, rewardType })}
                  />
                </Field>
                <Field label="Сумма">
                  <input
                    className={fieldClass}
                    type="number"
                    value={form.rewardAmount}
                    onChange={(event) =>
                      setForm({ ...form, rewardAmount: event.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Название">
                <input
                  className={fieldClass}
                  value={form.rewardLabel}
                  onChange={(event) =>
                    setForm({ ...form, rewardLabel: event.target.value })
                  }
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Код">
                  <input
                    className={fieldClass}
                    value={form.rewardCode}
                    onChange={(event) =>
                      setForm({ ...form, rewardCode: event.target.value })
                    }
                  />
                </Field>
                <Field label="Сгорает">
                  <input
                    className={fieldClass}
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(event) =>
                      setForm({ ...form, expiresAt: event.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Клуб">
                <select
                  className={fieldClass}
                  value={form.storeId}
                  onChange={(event) =>
                    setForm({ ...form, storeId: event.target.value })
                  }
                >
                  <option value="">Любой</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </Field>
              <LinkSelect
                label="Лутбокс"
                value={form.lootBoxId}
                items={lootBoxes}
                onChange={(lootBoxId) => setForm({ ...form, lootBoxId })}
              />
              <LinkSelect
                label="Задание"
                value={form.missionId}
                items={missions}
                onChange={(missionId) => setForm({ ...form, missionId })}
              />
              <LinkSelect
                label="Сезон"
                value={form.seasonId}
                items={seasons}
                onChange={(seasonId) => setForm({ ...form, seasonId })}
              />
              <Field label="Заметка">
                <textarea
                  className={`${fieldClass} min-h-20`}
                  value={form.note}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
                />
              </Field>
              <JsonField
                label="Evidence"
                value={form.evidenceText}
                onChange={(evidenceText) => setForm({ ...form, evidenceText })}
              />
              <button
                type="button"
                className={primaryButtonClass}
                disabled={saving === "reward"}
                onClick={onSave}
              >
                {editingId ? "Изменить награду" : "Поставить в кошелек"}
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
        </details>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle title="Кошелек наград" />
          {canApprove ? (
            <a
              className={smallButtonClass}
              href="/api/guests/gamification/rewards/export"
              download
            >
              Экспорт CSV
            </a>
          ) : null}
        </div>
        {canApprove ? (
          <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-zinc-950 dark:text-white">
                  Погашение кода гостя
                </p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  Когда гость показывает код из кошелька или QR-код, вставьте
                  короткий код кассиру. После погашения награда считается
                  выданной и повторно использовать код нельзя.
                </p>
              </div>
              <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <input
                  className={fieldClass}
                  value={redeemForm.claim}
                  placeholder="Например, LP-D5791101"
                  onChange={(event) =>
                    setRedeemForm((current) => ({
                      ...current,
                      claim: event.target.value,
                    }))
                  }
                />
                <select
                  className={fieldClass}
                  value={redeemForm.storeId}
                  onChange={(event) =>
                    setRedeemForm((current) => ({
                      ...current,
                      storeId: event.target.value,
                    }))
                  }
                >
                  <option value="">Клуб не проверять</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className={primaryButtonClass}
                disabled={saving === "rewardRedeem"}
                onClick={onRedeem}
              >
                Погасить
              </button>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <input
                className={fieldClass}
                value={redeemForm.note}
                placeholder="Заметка кассира, если нужна"
                onChange={(event) =>
                  setRedeemForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
              {redeemedReward ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                  Погашено:{" "}
                  <span className="font-bold">
                    {redeemedReward.rewardLabel}
                  </span>
                  {" · "}
                  {redeemedReward.profile?.displayName ??
                    redeemedReward.guest?.displayName ??
                    redeemedReward.guestExternalId ??
                    "гость"}
                  {" · "}
                  <span className="font-mono">
                    {redeemedReward.rewardCode ?? "без кода"}
                  </span>
                </div>
              ) : (
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  Погашение проверяет код, клуб и статус награды, затем
                  закрывает приз как выданный и защищает его от повторного
                  использования.
                </div>
              )}
            </div>
            <div className="mt-3 rounded-lg border border-cyan-200/70 bg-white/70 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-cyan-900/50 dark:bg-zinc-950/40 dark:text-zinc-300">
              <span className="font-semibold text-zinc-900 dark:text-white">
                Согласовано
              </span>{" "}
              — право на приз подтверждено, но выдача еще не закрыта.{" "}
              <span className="font-semibold text-zinc-900 dark:text-white">
                Выдано
              </span>{" "}
              — приз уже погашен или начислен, повторная выдача заблокирована.
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
            У вас read-only доступ к кошельку наград: можно смотреть очередь,
            статусы, коды и историю, но ручная выдача, экспорт, изменение
            статусов и кассирское погашение недоступны.
          </div>
        )}
        <RewardWalletFilters
          query={rewardSearch}
          onQueryChange={setRewardSearch}
          rewardTypes={selectedRewardTypes}
          onRewardTypesChange={setSelectedRewardTypes}
          storeIds={selectedStoreIds}
          onStoreIdsChange={setSelectedStoreIds}
          sort={rewardSort}
          onSortChange={setRewardSort}
          stores={rewardStoreOptions}
          totalCount={rewards.length}
          visibleCount={filteredRewards.length}
        />
        <div className="space-y-2">
          {filteredRewards.length ? (
            filteredRewards.map((reward) => (
              <RewardRow
                key={reward.id}
                reward={reward}
                onStatus={onStatus}
                onEdit={onEdit}
                saving={saving}
                canApprove={canApprove}
              />
            ))
          ) : (
            <EmptyState
              text={
                rewards.length ? "По фильтрам наград нет" : "Наград пока нет"
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}

export function RewardWalletFilters({
  query,
  onQueryChange,
  rewardTypes,
  onRewardTypesChange,
  storeIds,
  onStoreIdsChange,
  sort,
  onSortChange,
  stores,
  totalCount,
  visibleCount,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  rewardTypes: string[];
  onRewardTypesChange: (rewardTypes: string[]) => void;
  storeIds: string[];
  onStoreIdsChange: (storeIds: string[]) => void;
  sort: RewardSortMode;
  onSortChange: (sort: RewardSortMode) => void;
  stores: Store[];
  totalCount: number;
  visibleCount: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <Field label="Поиск по ФИО или телефону">
          <input
            className={fieldClass}
            value={query}
            placeholder="Например, Иванов или 993780"
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </Field>
        <Field label="Дата и время">
          <select
            className={fieldClass}
            value={sort}
            onChange={(event) =>
              onSortChange(event.target.value as RewardSortMode)
            }
          >
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
          </select>
        </Field>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <RewardFilterChips
          title="Тип награды"
          options={rewardTypeOptions}
          value={rewardTypes}
          onChange={onRewardTypesChange}
        />
        <RewardFilterChips
          title="Клуб"
          options={stores.map((store) => ({
            value: store.id,
            label: store.name,
          }))}
          value={storeIds}
          onChange={onStoreIdsChange}
        />
      </div>
      <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Показано {visibleCount} из {totalCount}
      </p>
    </div>
  );
}

export function RewardFilterChips({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const selected = new Set(value);
  const toggle = (nextValue: string) => {
    onChange(
      selected.has(nextValue)
        ? value.filter((currentValue) => currentValue !== nextValue)
        : [...value, nextValue],
    );
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/35">
      <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.length ? (
          options.map((option) => {
            const isSelected = selected.has(option.value);

            return (
              <button
                key={option.value}
                type="button"
                className={
                  isSelected
                    ? "rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-bold text-white dark:bg-emerald-300 dark:text-zinc-950"
                    : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-700 dark:hover:text-emerald-100"
                }
                onClick={() => toggle(option.value)}
              >
                {option.label}
              </button>
            );
          })
        ) : (
          <span className="text-xs text-zinc-400">Нет вариантов</span>
        )}
      </div>
    </div>
  );
}

export function rewardSearchTokens(reward: GuestGameReward) {
  const fullName = rewardGuestFullName(reward);
  const phone = formatRewardPhone(reward);

  return [
    fullName,
    formatGuestShortName(fullName),
    phone,
    reward.guest?.contact,
    reward.profile?.contactMasked,
    reward.rewardLabel,
    rewardRarityLabel(reward),
    reward.rewardCode,
    rewardActivityLabel(reward),
    reward.store?.name,
    rewardTypeLabelFromValue(reward.rewardType),
    formatDate(reward.qualifiedAt),
  ]
    .filter(Boolean)
    .map((token) => String(token).toLocaleLowerCase("ru-RU"));
}

export function LinkSelect<T extends { id: string; name: string }>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: T[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Не связан</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={`${label} JSON`}>
      <textarea
        className={`${fieldClass} min-h-32 font-mono text-xs leading-relaxed`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

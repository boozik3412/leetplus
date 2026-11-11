"use client";

import type { DryRunForm } from "../shared/types";
import type { Dispatch, SetStateAction } from "react";
import type {
  GuestGameDryRunResult,
  GuestGameProcessEventResult,
  GuestGameProfile,
  GuestGameTariffSnapshotEndpoint,
  GuestGameGuestLogCatalog,
  GuestGameSnapshotFactsResult,
  GuestGamePipelineRunResult,
  GuestGameSnapshotFact,
} from "@/lib/guest-gamification";
import type { GuestDashboardRow } from "@/lib/guests";
import type { Store } from "@/lib/stores";
import {
  emptyDryRunSource,
  smallButtonClass,
  primaryButtonClass,
  fieldClass,
  dryRunEventOptions,
  sessionTypeOptions,
} from "../shared/constants";
import {
  SectionTitle,
  MiniMetric,
  EmptyState,
  StatusMetric,
} from "../shared/ui";
import { formatDate, sessionTypeLabel, formatMoney } from "../shared/helpers";
import { TariffConditionFields } from "../shared/rule-fields";

export const dryRunPacketOptions = [
  { value: "", label: "не указано" },
  { value: "true", label: "пакет или абонемент" },
  { value: "false", label: "почасовая сессия" },
];

export function DryRunTab({
  form,
  setForm,
  result,
  processResult,
  profiles,
  guests,
  stores,
  tariffSnapshots,
  guestLogCatalog,
  snapshotFacts,
  pipelineResult,
  onRun,
  onProcess,
  onLoadFacts,
  onApplyFact,
  onPipelineRun,
  saving,
  canManage,
}: {
  form: DryRunForm;
  setForm: Dispatch<SetStateAction<DryRunForm>>;
  result: GuestGameDryRunResult | null;
  processResult: GuestGameProcessEventResult | null;
  profiles: GuestGameProfile[];
  guests: GuestDashboardRow[];
  stores: Store[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];
  guestLogCatalog: GuestGameGuestLogCatalog;
  snapshotFacts: GuestGameSnapshotFactsResult | null;
  pipelineResult: GuestGamePipelineRunResult | null;
  onRun: () => Promise<void>;
  onProcess: () => Promise<void>;
  onLoadFacts: () => Promise<void>;
  onApplyFact: (fact: GuestGameSnapshotFact) => void;
  onPipelineRun: (dryRunOnly: boolean) => Promise<void>;
  saving: string | null;
  canManage: boolean;
}) {
  const isRunning = saving === "dryRun";
  const isLoadingFacts = saving === "facts";
  const isProcessing = saving === "processEvent";
  const isPipelinePreview = saving === "pipelinePreview";
  const isPipelineRunning = saving === "pipelineRun";
  const canProcess =
    Boolean(result) &&
    Boolean(
      form.profileId || form.guestId || result?.profile || result?.guest,
    ) &&
    ((result?.summary.eligibleRules ?? 0) > 0 ||
      (result?.summary.projectedXpDelta ?? 0) > 0);

  function update<K extends keyof DryRunForm>(key: K, value: DryRunForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...emptyDryRunSource,
    }));
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionTitle title="Тест запуска" />
            <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
              Проверьте, что произойдет при событии гостя: какие лутбоксы,
              задания и Battle Pass сработают, где есть блокировки, сколько XP и
              рублей попадет в очередь выдачи.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            Награды, события и записи в Langame не создаются
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Факты Langame snapshot
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Загрузите последние сохраненные сессии, покупки, товарные
                продажи, логи, балансы и группы лояльности, затем выберите факт
                как основу проверки правил.
              </p>
            </div>
            <button
              className={smallButtonClass}
              type="button"
              disabled={isLoadingFacts}
              onClick={onLoadFacts}
            >
              {isLoadingFacts ? "Загружаем..." : "Загрузить факты"}
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-zinc-950 dark:text-white">
                Batch pipeline snapshot-фактов
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                Обрабатывает до 20 последних сохраненных фактов: сначала
                проверяет правила, пропускает дубли и факты без гостя, затем
                пишет только события, XP и очередь наград внутри LeetPlus.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={smallButtonClass}
                type="button"
                disabled={isPipelinePreview || isPipelineRunning}
                onClick={() => onPipelineRun(true)}
              >
                {isPipelinePreview ? "Смотрим..." : "Предпросмотр batch"}
              </button>
              {canManage ? (
                <button
                  className={primaryButtonClass}
                  type="button"
                  disabled={isPipelinePreview || isPipelineRunning}
                  onClick={() => onPipelineRun(false)}
                >
                  {isPipelineRunning ? "Обрабатываем..." : "Обработать batch"}
                </button>
              ) : null}
            </div>
          </div>

          {pipelineResult ? (
            <PipelineResultPanel result={pipelineResult} />
          ) : null}

          {snapshotFacts ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5 2xl:grid-cols-10">
                <MiniMetric
                  label="сессии"
                  value={snapshotFacts.summary.sessions}
                />
                <MiniMetric label="логи" value={snapshotFacts.summary.logs} />
                <MiniMetric
                  label="транзакции"
                  value={snapshotFacts.summary.transactions}
                />
                <MiniMetric
                  label="операции"
                  value={snapshotFacts.summary.operationLogs}
                />
                <MiniMetric
                  label="баланс"
                  value={snapshotFacts.summary.balances}
                />
                <MiniMetric
                  label="бонусы"
                  value={snapshotFacts.summary.bonusBalances}
                />
                <MiniMetric
                  label="группы"
                  value={snapshotFacts.summary.loyaltyGroups}
                />
                <MiniMetric
                  label="товары"
                  value={snapshotFacts.summary.productExpenses}
                />
                <MiniMetric
                  label="рефералы"
                  value={snapshotFacts.summary.referrals}
                />
                <MiniMetric
                  label="последний факт"
                  value={formatDate(snapshotFacts.summary.latestAt)}
                />
              </div>
              {snapshotFacts.facts.length ? (
                <div className="max-h-72 divide-y divide-zinc-200 overflow-auto rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
                  {snapshotFacts.facts.map((fact) => (
                    <SnapshotFactRow
                      key={fact.id}
                      fact={fact}
                      onApply={onApplyFact}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState text="Snapshot-фактов пока нет. Запустите синхронизацию гостевых данных на странице синхронизации." />
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Профиль гостя
            <select
              className={fieldClass}
              value={form.profileId}
              onChange={(event) => {
                update("profileId", event.target.value);
                update("guestId", "");
              }}
            >
              <option value="">Не выбран</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName} · ур. {profile.level}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Гость Langame
            <select
              className={fieldClass}
              value={form.guestId}
              onChange={(event) => {
                update("guestId", event.target.value);
                update("profileId", "");
              }}
            >
              <option value="">Не выбран</option>
              {guests.slice(0, 150).map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.displayName} · {guest.contact}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Клуб
            <select
              className={fieldClass}
              value={form.storeId}
              onChange={(event) => update("storeId", event.target.value)}
            >
              <option value="">Вся сеть / не выбран</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Событие
            <select
              className={fieldClass}
              value={form.eventType}
              onChange={(event) => update("eventType", event.target.value)}
            >
              {dryRunEventOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Дата и время
            <input
              className={fieldClass}
              type="datetime-local"
              value={form.occurredAt}
              onChange={(event) => update("occurredAt", event.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Тип guests/logs
            <input
              className={fieldClass}
              list="guest-log-type-options"
              placeholder="visit, login, tournament"
              value={form.guestLogType}
              onChange={(event) => update("guestLogType", event.target.value)}
            />
            <datalist id="guest-log-type-options">
              {guestLogCatalog.items.map((item) => (
                <option key={item.normalizedType} value={item.type} />
              ))}
            </datalist>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Тип сессии
              <select
                className={fieldClass}
                value={form.sessionType}
                onChange={(event) => update("sessionType", event.target.value)}
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
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Пакет или абонемент
              <select
                className={fieldClass}
                value={form.sessionPacket}
                onChange={(event) =>
                  update("sessionPacket", event.target.value)
                }
              >
                {dryRunPacketOptions.map((option) => (
                  <option key={option.value || "unknown"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="lg:col-span-3">
            <TariffConditionFields
              snapshots={tariffSnapshots}
              tariffGroupId={form.tariffGroupId}
              tariffPeriodId={form.tariffPeriodId}
              tariffTypeId={form.tariffTypeId}
              onChange={(patch) =>
                setForm((current) => ({
                  ...current,
                  ...patch,
                  ...emptyDryRunSource,
                }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Минуты сессии
              <input
                className={fieldClass}
                type="number"
                min="0"
                value={form.sessionMinutes}
                onChange={(event) =>
                  update("sessionMinutes", event.target.value)
                }
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Покупка, руб
              <input
                className={fieldClass}
                type="number"
                min="0"
                value={form.spendAmount}
                onChange={(event) => update("spendAmount", event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Название товара
              <input
                className={fieldClass}
                placeholder="Например: энергетик"
                value={form.productName}
                onChange={(event) => update("productName", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Категория товара
              <input
                className={fieldClass}
                placeholder="Бар, напитки"
                value={form.categoryName}
                onChange={(event) => update("categoryName", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              ID товара
              <input
                className={fieldClass}
                placeholder="productId"
                value={form.productId}
                onChange={(event) => update("productId", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Внешний ID товара
              <input
                className={fieldClass}
                placeholder="Langame id"
                value={form.externalProductId}
                onChange={(event) =>
                  update("externalProductId", event.target.value)
                }
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              ID категории
              <input
                className={fieldClass}
                placeholder="categoryId"
                value={form.categoryId}
                onChange={(event) => update("categoryId", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Поставщик
              <input
                className={fieldClass}
                placeholder="supplier"
                value={form.supplierName}
                onChange={(event) => update("supplierName", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Количество
              <input
                className={fieldClass}
                type="number"
                min="0"
                value={form.quantity}
                onChange={(event) => update("quantity", event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className={primaryButtonClass}
            type="button"
            disabled={isRunning}
            onClick={onRun}
          >
            {isRunning ? "Проверяем..." : "Проверить сценарий"}
          </button>
          {canManage ? (
            <button
              className={smallButtonClass}
              type="button"
              disabled={!canProcess || isProcessing}
              onClick={onProcess}
            >
              {isProcessing ? "Записываем..." : "Создать событие и награды"}
            </button>
          ) : null}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Если дата не задана, API проверит сценарий на текущий момент.
          </p>
        </div>

        {form.sourceFactId ? (
          <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Выбран snapshot-факт: {form.sourceFactKind} ·{" "}
            {form.externalDomain || "без домена"} ·{" "}
            {form.externalId || form.sourceFactId}
          </p>
        ) : null}
      </section>

      {result ? (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <SectionTitle title="Результат проверки" />
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {result.profile?.displayName ??
                  result.guest?.displayName ??
                  "Гость не выбран"}{" "}
                · {result.store?.name ?? "вся сеть"} · {result.eventType}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {new Date(result.occurredAt).toLocaleString("ru-RU")}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-6">
            <StatusMetric
              label="Проверено"
              value={result.summary.checkedRules}
              hint="правил"
            />
            <StatusMetric
              label="Сработает"
              value={result.summary.eligibleRules}
              hint="без блокировок"
            />
            <StatusMetric
              label="Блок"
              value={result.summary.blockedRules}
              hint="нужны правки"
            />
            <StatusMetric
              label="XP"
              value={`+${result.summary.projectedXpDelta}`}
              hint={`${result.input.sessionMinutes} мин`}
            />
            <StatusMetric
              label="Сессия"
              value={sessionTypeLabel(result.input.sessionType)}
              hint={packetStateLabel(result.input.sessionPacket)}
            />
            <StatusMetric
              label="Награды"
              value={formatMoney(result.summary.estimatedRewardAmount)}
              hint={`${result.input.spendAmount} руб чек`}
            />
          </div>

          {canManage ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                    Подтвержденный запуск в LeetPlus
                  </p>
                  <p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-100/80">
                    API заново пересчитает сценарий, создаст событие, начислит
                    XP и положит награды в очередь. Записи в Langame нет.
                  </p>
                </div>
                <button
                  className={primaryButtonClass}
                  type="button"
                  disabled={!canProcess || isProcessing}
                  onClick={onProcess}
                >
                  {isProcessing ? "Запускаем..." : "Записать в LeetPlus"}
                </button>
              </div>
              {!canProcess ? (
                <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-200">
                  Для записи нужен гость и хотя бы одно сработавшее правило или
                  XP.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
              У вас read-only доступ: сценарий можно проверять и разбирать, но
              запись события, начисление XP и постановка наград в очередь
              недоступны.
            </div>
          )}

          {processResult ? (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20">
              <div className="grid gap-3 md:grid-cols-5">
                <StatusMetric
                  label="статус"
                  value={
                    processResult.summary.idempotent ? "повтор" : "записано"
                  }
                  hint={
                    processResult.summary.idempotent
                      ? "без новых записей"
                      : "создано в LeetPlus"
                  }
                />
                <StatusMetric
                  label="событие"
                  value={processResult.event.eventType}
                  hint={formatDate(processResult.event.occurredAt)}
                />
                <StatusMetric
                  label="XP применено"
                  value={`+${processResult.summary.appliedXpDelta}`}
                  hint={
                    processResult.summary.idempotent
                      ? "без повторного XP"
                      : processResult.summary.profileCreated
                        ? "профиль создан"
                        : "профиль обновлен"
                  }
                />
                <StatusMetric
                  label="наград в очереди"
                  value={processResult.summary.createdRewards}
                  hint={
                    processResult.summary.idempotent
                      ? "без дублей"
                      : formatMoney(processResult.summary.queuedRewardAmount)
                  }
                />
                <StatusMetric
                  label="Langame"
                  value="нет"
                  hint="write API не использовался"
                />
              </div>
              {processResult.summary.idempotent ? (
                <p className="mt-3 rounded-md border border-cyan-200 bg-white/70 px-3 py-2 text-xs font-semibold text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-100">
                  Snapshot уже был обработан: LeetPlus вернул существующее
                  событие и не создавал повторный XP или награды.
                </p>
              ) : null}
              {processResult.summary.idempotencyKey ? (
                <p className="mt-3 break-all text-xs text-cyan-800 dark:text-cyan-100">
                  Idempotency: {processResult.summary.idempotencyKey}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-2">
            {result.rules.length ? (
              result.rules.map((rule) => (
                <DryRunRuleCard key={`${rule.kind}-${rule.id}`} rule={rule} />
              ))
            ) : (
              <EmptyState text="Правил для проверки пока нет" />
            )}
          </div>
        </section>
      ) : (
        <EmptyState text="Запустите проверку, чтобы увидеть допуск, награды, XP и причины блокировки." />
      )}
    </div>
  );
}

export function PipelineResultPanel({
  result,
}: {
  result: GuestGamePipelineRunResult;
}) {
  const modeLabel = result.dryRunOnly ? "предпросмотр" : "запуск";
  const statusLabel: Record<string, string> = {
    DRY_RUN: "проверено",
    PROCESSED: "обработано",
    SKIPPED: "пропуск",
    DUPLICATE: "дубль",
    ERROR: "ошибка",
  };
  const statusClass: Record<string, string> = {
    DRY_RUN: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
    PROCESSED:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    SKIPPED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
    DUPLICATE:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    ERROR: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/20">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold text-cyan-950 dark:text-cyan-100">
            Batch pipeline: {modeLabel}
          </p>
          <p className="mt-1 text-xs leading-5 text-cyan-900/75 dark:text-cyan-100/75">
            {result.note}
          </p>
        </div>
        <span className="rounded-full border border-cyan-300 px-3 py-1 text-xs font-bold text-cyan-800 dark:border-cyan-800 dark:text-cyan-200">
          Langame write: нет
        </span>
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
        <MiniMetric label="доступно" value={result.availableFacts} />
        <MiniMetric label="проверено" value={result.checkedFacts} />
        <MiniMetric label="обработано" value={result.processedFacts} />
        <MiniMetric label="пропуск" value={result.skippedFacts} />
        <MiniMetric label="дубли" value={result.duplicateFacts} />
        <MiniMetric label="ошибки" value={result.erroredFacts} />
        <MiniMetric label="XP" value={`+${result.appliedXpDelta}`} />
        <MiniMetric label="награды" value={result.queuedRewards} />
      </div>

      {result.facts.length ? (
        <div className="divide-y divide-cyan-200/70 overflow-hidden rounded-lg border border-cyan-200/70 bg-white dark:divide-cyan-900/60 dark:border-cyan-900/60 dark:bg-zinc-950">
          {result.facts.slice(0, 8).map((fact) => {
            const idempotentProcess = fact.process?.summary.idempotent === true;
            const idempotencyKey = fact.process?.summary.idempotencyKey;

            return (
              <div
                key={`${fact.factId}-${fact.status}`}
                className="grid gap-2 px-3 py-2 text-xs md:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-zinc-950 dark:text-white">
                    {fact.label}
                  </p>
                  <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                    {formatDate(fact.occurredAt)} ·{" "}
                    {fact.store?.name ?? "вся сеть"} · {fact.eventType}
                  </p>
                  {fact.reason ? (
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                      {fact.reason}
                    </p>
                  ) : null}
                  {idempotentProcess ? (
                    <p className="mt-1 text-amber-700 dark:text-amber-200">
                      Повтор обработан безопасно: новых XP и наград нет.
                    </p>
                  ) : null}
                  {idempotentProcess && idempotencyKey ? (
                    <p className="mt-1 break-all text-[11px] text-amber-700/80 dark:text-amber-200/80">
                      Idempotency: {idempotencyKey}
                    </p>
                  ) : null}
                </div>
                <span
                  className={[
                    "self-start rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide",
                    statusClass[fact.status],
                  ].join(" ")}
                >
                  {statusLabel[fact.status] ?? fact.status}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState text="Подходящих snapshot-фактов для batch пока нет." />
      )}
    </div>
  );
}

export function SnapshotFactRow({
  fact,
  onApply,
}: {
  fact: GuestGameSnapshotFact;
  onApply: (fact: GuestGameSnapshotFact) => void;
}) {
  const sourceLabel: Record<GuestGameSnapshotFact["source"], string> = {
    GUEST_SESSION: "сессия",
    GUEST_LOG: "лог",
    GUEST_TRANSACTION: "транзакция",
    GUEST_OPERATION_LOG: "операция",
    GUEST_BALANCE: "баланс",
    GUEST_BONUS_BALANCE: "бонусы",
    GUEST_LOYALTY_GROUP: "группа",
    PRODUCT_EXPENSE: "товары",
    GUEST_GAME_REFERRAL: "реферал",
  };
  const eventLabel =
    dryRunEventOptions.find((option) => option.value === fact.eventType)
      ?.label ?? fact.eventType;

  return (
    <button
      className="grid w-full gap-2 px-3 py-3 text-left transition hover:bg-emerald-50/70 focus:bg-emerald-50/70 focus:outline-none dark:hover:bg-emerald-950/20 dark:focus:bg-emerald-950/20 md:grid-cols-[1fr_auto]"
      type="button"
      onClick={() => onApply(fact)}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-zinc-950 dark:text-white">
            {fact.label}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            {sourceLabel[fact.source]}
          </span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            {eventLabel}
          </span>
        </span>
        <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
          {formatDate(fact.occurredAt)} · {fact.store?.name ?? "вся сеть"} ·{" "}
          {fact.guest?.contact ?? "гость не привязан"}
        </span>
        {fact.details ? (
          <span className="mt-1 block truncate text-xs text-zinc-400">
            {fact.details}
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap items-center gap-2 md:justify-end">
        {fact.sessionMinutes != null ? (
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {fact.sessionMinutes} мин
          </span>
        ) : null}
        {fact.sessionPacket != null || fact.sessionType ? (
          <span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
            {fact.sessionPacket == null
              ? sessionTypeLabel(fact.sessionType)
              : packetStateLabel(fact.sessionPacket)}
          </span>
        ) : null}
        {fact.guestLogType ? (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            logs: {fact.guestLogType}
          </span>
        ) : null}
        {fact.spendAmount != null && fact.spendAmount > 0 ? (
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {formatMoney(fact.spendAmount)}
          </span>
        ) : null}
        <span className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
          Взять в тест
        </span>
      </span>
    </button>
  );
}

export function DryRunRuleCard({
  rule,
}: {
  rule: GuestGameDryRunResult["rules"][number];
}) {
  const kindLabel =
    rule.kind === "LOOT_BOX"
      ? "Лутбокс"
      : rule.kind === "MISSION"
        ? "Задание"
        : "Battle Pass";

  return (
    <article
      className={[
        "rounded-lg border p-4 transition",
        rule.eligible
          ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20"
          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {kindLabel}
          </p>
          <h3 className="mt-1 text-base font-bold text-zinc-950 dark:text-white">
            {rule.name}
          </h3>
        </div>
        <span
          className={[
            "rounded-full px-2 py-1 text-xs font-bold",
            rule.eligible
              ? "bg-emerald-500 text-white"
              : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
          ].join(" ")}
        >
          {rule.eligible ? "сработает" : "блок"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-3 dark:text-zinc-300">
        <div>
          <span className="block text-xs font-semibold uppercase text-zinc-400">
            Награда
          </span>
          {rule.selectedRewardLabel ?? rule.rewardLabel ?? "не задана"}
        </div>
        <div>
          <span className="block text-xs font-semibold uppercase text-zinc-400">
            Сумма
          </span>
          {formatMoney(rule.rewardAmount ?? 0)}
        </div>
        <div>
          <span className="block text-xs font-semibold uppercase text-zinc-400">
            XP
          </span>
          +{rule.xpDelta}
        </div>
      </div>

      {rule.progress?.applicable ? (
        <div className="mt-3 rounded-md border border-cyan-100 bg-cyan-50/70 p-3 dark:border-cyan-900/50 dark:bg-cyan-950/20">
          <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase text-cyan-800 dark:text-cyan-100">
            <span>Прогресс</span>
            <span>
              {rule.progress.current}/{rule.progress.target}
              {rule.progress.unit ? ` ${rule.progress.unit}` : ""}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white dark:bg-zinc-900">
            <div
              className="h-full rounded-full bg-cyan-500"
              style={{ width: `${rule.progress.percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-cyan-900/70 dark:text-cyan-100/70">
            Событий учтено: {rule.progress.matchedEvents}
            {rule.progress.windowDays
              ? ` за ${rule.progress.windowDays} дн.`
              : ""}
          </p>
        </div>
      ) : null}

      {rule.blockers.length ? (
        <div className="mt-3 space-y-1">
          {rule.blockers.map((blocker) => (
            <p
              key={blocker}
              className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
            >
              {blocker}
            </p>
          ))}
        </div>
      ) : null}

      {rule.reasons.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {rule.reasons.slice(0, 6).map((reason) => (
            <span
              key={reason}
              className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-800"
            >
              {reason}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function packetStateLabel(value: boolean | null) {
  if (value === true) {
    return "пакет или абонемент";
  }
  if (value === false) {
    return "почасовая";
  }
  return "тип не определён";
}

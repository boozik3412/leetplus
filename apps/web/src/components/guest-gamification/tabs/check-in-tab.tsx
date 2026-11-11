"use client";

import {
  rewardTypeOptions,
  primaryButtonClass,
  fieldClass,
  sessionTypeOptions,
  smallButtonClass,
} from "../shared/constants";
import type { MissionForm, RuleTemplateType } from "../shared/types";
import type {
  GuestGameMission,
  GuestGameTariffSnapshotEndpoint,
  GuestGameStatus,
} from "@/lib/guest-gamification";
import type { GuestAudience } from "@/lib/guests";
import type { Store } from "@/lib/stores";
import {
  normalizeCheckInMissionForm,
  trackingId,
  rewardTypeLabelFromValue,
  storeScopeLabel,
  sessionTypeLabel,
  stringRule,
  tariffRuleSummary,
} from "../shared/helpers";
import {
  RulesLayout,
  RuleCommonFields,
  StoreSelect,
  TariffConditionFields,
  RuleCard,
} from "../shared/rule-fields";
import Link from "next/link";
import {
  FormSection,
  Field,
  OptionSelect,
  ToggleField,
  OptionHelp,
} from "../shared/ui";
import {
  HourlySessionSourceNote,
} from "@/components/hourly-session-source-note";

export const checkInRewardTypeOptions = rewardTypeOptions.filter((option) =>
  ["XP", "BONUS_BALANCE"].includes(option.value),
);

export function CheckInTab({
  form,
  setForm,
  missions,
  audiences,
  stores,
  tariffSnapshots,
  editingId,
  isFormOpen,
  onSave,
  onEdit,
  onCreateNew,
  onReset,
  onStatus,
  onDelete,
  saving,
  canManage,
}: {
  form: MissionForm;
  setForm: (form: MissionForm) => void;
  missions: GuestGameMission[];
  audiences: GuestAudience[];
  stores: Store[];
  tariffSnapshots: GuestGameTariffSnapshotEndpoint[];

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
  saving: string | null;
  canManage: boolean;
}) {
  const showForm = isFormOpen && isCheckInMissionForm(form);
  const checkInTitle = form.name.trim();
  const formTitle =
    editingId && showForm && checkInTitle
      ? `Редактирование чек-ина "${checkInTitle}"`
      : editingId && showForm
        ? "Редактирование чек-ина"
        : "Настройка чек-ина";
  const rewardIsXp = form.rewardType === "XP";
  const xpRewardNumber = Number(form.xpReward);
  const xpEnabled =
    rewardIsXp || (Number.isFinite(xpRewardNumber) && xpRewardNumber > 0);

  function patchForm(patch: Partial<MissionForm>) {
    setForm(normalizeCheckInMissionForm({ ...form, ...patch }));
  }

  function selectRewardType(rewardType: string) {
    const nextIsXp = rewardType === "XP";
    const currentLabel = form.rewardLabel.trim();

    patchForm({
      rewardType,
      rewardAmount: nextIsXp
        ? "0"
        : form.rewardAmount && form.rewardAmount !== "0"
          ? form.rewardAmount
          : "50",
      xpReward: nextIsXp
        ? form.xpReward && form.xpReward !== "0"
          ? form.xpReward
          : "20"
        : form.xpReward,
      rewardLabel:
        currentLabel &&
        currentLabel !== "XP за чекин" &&
        currentLabel !== "Бонусы за чекин"
          ? currentLabel
          : nextIsXp
            ? "XP за чекин"
            : "Бонусы за чекин",
    });
  }

  function toggleXpReward(enabled: boolean) {
    patchForm({
      xpReward: enabled
        ? form.xpReward && form.xpReward !== "0"
          ? form.xpReward
          : "20"
        : "0",
    });
  }

  return (
    <RulesLayout
      canManage={canManage}
      formTitle={formTitle}
      formAction={
        !showForm ? (
          <Link
            href="/gamification/missions/wizard?taskType=CHECK_IN"
            className={`${primaryButtonClass} sm:min-w-52`}
          >
            Создать чек-ин в мастере
          </Link>
        ) : undefined
      }
      form={
        showForm ? (
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
              hideRewardFields
              onChange={(patch) => patchForm(patch)}
            />

            <FormSection title="Награда за чек-ин">
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Основная награда">
                  <OptionSelect
                    options={checkInRewardTypeOptions}
                    value={form.rewardType}
                    preservedLabel="Сохраненный тип награды"
                    onChange={selectRewardType}
                  />
                </Field>
                {!rewardIsXp ? (
                  <Field label="Бонусы Langame">
                    <input
                      className={fieldClass}
                      type="number"
                      min="0"
                      value={form.rewardAmount}
                      onChange={(event) =>
                        patchForm({ rewardAmount: event.target.value })
                      }
                    />
                  </Field>
                ) : null}
                <Field label="Получать XP">
                  <ToggleField
                    label="Начислять опыт"
                    checked={xpEnabled}
                    disabled={rewardIsXp}
                    onChange={toggleXpReward}
                  />
                </Field>
                <Field label="XP за чек-ин">
                  <input
                    className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:bg-zinc-900`}
                    type="number"
                    min="0"
                    value={form.xpReward}
                    disabled={!xpEnabled}
                    onChange={(event) =>
                      patchForm({ xpReward: event.target.value })
                    }
                  />
                  <OptionHelp>
                    Опыт начисляется вместе с основной наградой при каждом
                    успешном чек-ине.
                  </OptionHelp>
                </Field>
                <div className="md:col-span-4">
                  <Field label="Текст награды">
                    <input
                      className={fieldClass}
                      value={form.rewardLabel}
                      onChange={(event) =>
                        patchForm({ rewardLabel: event.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>
            </FormSection>

            <FormSection title="Кнопка и клубы">
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm leading-6 text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
                Кнопка чек-ина появится в игровом модуле выбранных клубов, когда
                правило активно. Backend дополнительно проверяет активную сессию
                гостя в Langame и не дает сделать повторный чек-ин в том же
                клубе до следующего календарного дня по времени клуба.
              </div>
              <StoreSelect
                stores={stores}
                value={form.storeIds}
                onChange={(storeIds) => patchForm({ storeIds })}
              />
            </FormSection>

            <FormSection title="Условия активной сессии">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Тип задания">
                  <input
                    className={fieldClass}
                    value="Чекин в клубе"
                    disabled
                    readOnly
                  />
                  <OptionHelp>
                    Чекин срабатывает только от события CHECK_IN.
                  </OptionHelp>
                </Field>
                <Field label="Тип сессии">
                  <select
                    className={fieldClass}
                    value={form.sessionType}
                    onChange={(event) =>
                      patchForm({ sessionType: event.target.value })
                    }
                  >
                    <option value="">любой тип</option>
                    {sessionTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <OptionHelp>
                    Оставьте любой тип, если чек-ин доступен при любой активной
                    сессии. Выберите пакет/абонемент или почасовую сессию для
                    дополнительного ограничения.
                  </OptionHelp>
                  {form.sessionType === "regular_session" ? (
                    <HourlySessionSourceNote />
                  ) : null}
                </Field>
              </div>
              <TariffConditionFields
                snapshots={tariffSnapshots}
                tariffGroupId={form.tariffGroupId}
                tariffPeriodId={form.tariffPeriodId}
                tariffTypeId={form.tariffTypeId}
                onChange={patchForm}
              />
            </FormSection>

            <FormSection title="Служебные ограничения">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Общий лимит наград">
                  <input
                    className={fieldClass}
                    type="number"
                    min="0"
                    placeholder="без лимита"
                    value={form.totalRewardLimit}
                    onChange={(event) =>
                      patchForm({ totalRewardLimit: event.target.value })
                    }
                  />
                  <OptionHelp>
                    Лимит на одного гостя не задается здесь по умолчанию:
                    повторный чек-ин уже ограничен одним разом в день в одном
                    клубе.
                  </OptionHelp>
                </Field>
                <div className="space-y-2">
                  <ToggleField
                    label="Подтверждает кассир"
                    checked={form.requireCashierConfirmation}
                    onChange={(requireCashierConfirmation) =>
                      patchForm({ requireCashierConfirmation })
                    }
                  />
                  <ToggleField
                    label="Требовать ручную выдачу"
                    checked={form.manualApprovalRequired}
                    onChange={(manualApprovalRequired) =>
                      patchForm({ manualApprovalRequired })
                    }
                  />
                </div>
              </div>
            </FormSection>

            <button
              type="button"
              className={primaryButtonClass}
              disabled={saving === "mission"}
              onClick={onSave}
            >
              {editingId ? "Сохранить" : "Создать правило чек-ина"}
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
      listTitle="Настройки чек-ина"
      listSummary={
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
          Эти правила управляют кнопкой чек-ина в игровом модуле. Активное
          правило сразу попадает в визуальный редактор выбранного клуба.
        </div>
      }
      items={missions}
      layout="stacked"
      renderItem={(item) => (
        <RuleCard
          key={item.id}
          eyebrow="Сохраненное правило"
          trackingId={trackingId("CHECKIN", item.id)}
          title={item.name}
          status={item.status}
          subtitle={`Кнопка чек-ина · ${
            item.rewardLabel ?? rewardTypeLabelFromValue(item.rewardType)
          }`}
          meta={[
            storeScopeLabel(item.storeIds, stores),
            item.audience?.name ?? "все гости",
            ...(item.xpReward > 0 ? [`+${item.xpReward} XP`] : []),
            `тип: ${sessionTypeLabel(stringRule(item.conditions, "sessionType", ""))}`,
            tariffRuleSummary(item.conditions),
            item.manualApprovalRequired ? "ручная выдача" : "автовыдача",
          ]}
          details={
            <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Один гость может сделать чек-ин в одном клубе один раз за
              календарный день по времени клуба.
            </p>
          }
          onEdit={() => {
            window.location.assign(
              `/gamification/missions/wizard?missionId=${encodeURIComponent(item.id)}`,
            );
          }}
          onStatus={(status) => onStatus("missions", item.id, status)}
          saving={saving === `missions-${item.id}`}
          onDelete={() => onDelete("missions", item.id, item.name)}
          deleteSaving={saving === `missions-delete-${item.id}`}
          canManage={canManage}
        />
      )}
    />
  );
}

export function isCheckInMissionForm(form: MissionForm) {
  return form.missionType === "CHECK_IN" || form.triggerKind === "CHECK_IN";
}

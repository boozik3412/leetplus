import {
  manualXpEventOptions,
  rewardRarityLabels,
  rewardStatusActionLabels,
  guestLogBusinessPresetDefinitions,
  fallbackGuestLogEventOptions,
  weekdayOptions,
  rewardTypeLabelOptions,
  defaultLootBoxPrizes,
  sessionTypeOptions,
} from "./constants";
import type {
  MissionQuestStepForm,
  GuestLogBusinessPreset,
  GuestLogEventOption,
  StatusPillTone,
  MissionForm,
  SeasonLevelStepForm,
  LootBoxPeriodicLimitPeriod,
  LootBoxPrizeForm,
  LootBoxCaseRarity,
  LootBoxForm,
} from "./types";
import type {
  GuestGameReward,
  GuestGameRewardStatus,
  GuestGameGuestLogCatalog,
  GuestGameStatus,
  GuestGameMission,
  GuestGameTariffSnapshotEndpoint,
} from "@/lib/guest-gamification";
import { isAutomaticLedgerReward } from "@/lib/guest-reward-status-labels";
import type { Store } from "@/lib/stores";
import {
  defaultLootBoxPrizeIconKey,
  normalizeLootBoxPrizeIconKey,
  normalizeLootBoxPrizeColor,
  type LootBoxPrizeVisualMode,
} from "@/components/lootbox-prize-visual";

export function manualXpEventOption(value: string) {
  return (
    manualXpEventOptions.find((option) => option.value === value) ??
    manualXpEventOptions[0]
  );
}

export function manualXpPayloadText(eventType: string) {
  const option = manualXpEventOption(eventType);

  return jsonText({
    reason: option.payloadReason,
    createdFrom: "guest_game_hub",
  });
}

export function cloneMissionQuestSteps(steps: MissionQuestStepForm[]) {
  return steps.map((step) => ({ ...step }));
}

export function rewardGuestFullName(reward: GuestGameReward) {
  return (
    reward.profile?.displayName ??
    reward.guest?.displayName ??
    reward.guestExternalId ??
    "Гость"
  );
}

export function formatGuestShortName(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\s+/g, " ");

  if (!normalized || normalized === "без гостя") {
    return "Гость";
  }

  if (/^гость(?:\s|$)/i.test(normalized)) {
    return normalized;
  }

  const parts = normalized.split(" ").filter(Boolean);
  const initial = (part: string) => part.slice(0, 1).toLocaleUpperCase("ru-RU");

  if (parts.length >= 3) {
    return `${parts[0]} ${initial(parts[1])}.${initial(parts[2])}.`;
  }

  if (parts.length === 2) {
    return `${parts[0]} ${initial(parts[1])}.`;
  }

  return normalized;
}

export function formatPhoneTail(value: string | null | undefined) {
  if (!value) {
    return "телефон не указан";
  }

  const digits = value.replace(/\D/g, "");

  if (digits.length >= 6) {
    return `***${digits.slice(-6)}`;
  }

  if (digits.length > 0) {
    return `***${digits}`;
  }

  return value;
}

export function formatRewardPhone(reward: GuestGameReward) {
  return formatPhoneTail(
    reward.guest?.contact ?? reward.profile?.contactMasked,
  );
}

export function rewardActivityLabel(reward: GuestGameReward) {
  if (reward.activityLabel?.trim()) {
    return reward.activityLabel;
  }

  if (reward.lootBox) {
    return `Лутбокс "${reward.lootBox.name}"`;
  }

  if (reward.mission) {
    if (
      reward.mission.missionType === "CHECK_IN" ||
      reward.mission.triggerKind === "CHECK_IN"
    ) {
      return "Чекин";
    }

    return `Задание "${reward.mission.name}"`;
  }

  if (reward.season) {
    return `Battlepass "${reward.season.name}"`;
  }

  if (reward.source === "MANUAL" || reward.source === "CASHIER") {
    return "Ручная награда";
  }

  return "Игровое событие";
}

export function rewardRarityLabel(reward: GuestGameReward) {
  return (
    reward.rewardRarityLabel ??
    (reward.rewardRarity ? rewardRarityLabels[reward.rewardRarity] : null)
  );
}

export function rewardStatusButtonLabel(
  reward: GuestGameReward,
  status: GuestGameRewardStatus,
) {
  if (status === "APPROVED" && isAutomaticLedgerReward(reward)) {
    return "Согласовать и начислить";
  }

  return rewardStatusActionLabels[status];
}

export function guestLogBusinessPresets(
  items: GuestGameGuestLogCatalog["items"],
): GuestLogBusinessPreset[] {
  if (!items.length) {
    return [];
  }

  const mappedPresets = new Map<string, GuestLogBusinessPreset>();

  for (const item of items) {
    if (!item.mapping) {
      continue;
    }

    const definition = guestLogBusinessPresetDefinitions.find(
      (preset) => preset.id === item.mapping?.preset,
    );
    const id = `mapped:${item.mapping.preset}:${item.mapping.intent}`;
    const existing = mappedPresets.get(id) ?? {
      id,
      label:
        item.mapping.preset === "custom"
          ? item.mapping.label
          : (definition?.label ?? item.mapping.label),
      description:
        item.mapping.note ??
        definition?.description ??
        "Сохраненное сопоставление raw-типа guests/logs.",
      intent: item.mapping.intent,
      tokens: [],
      types: [],
    };

    if (!existing.types.includes(item.type)) {
      existing.types.push(item.type);
    }

    mappedPresets.set(id, existing);
  }

  const autoPresets = guestLogBusinessPresetDefinitions
    .map((definition) => ({
      ...definition,
      types: Array.from(
        new Set(
          items
            .filter(
              (item) =>
                !item.mapping &&
                guestLogTypeMatchesPreset(item, definition.tokens),
            )
            .map((item) => item.type),
        ),
      ),
    }))
    .filter((preset) => preset.types.length);

  return [...mappedPresets.values(), ...autoPresets];
}

export function guestLogTypeMatchesPreset(
  item: GuestGameGuestLogCatalog["items"][number],
  tokens: string[],
) {
  const searchable = `${item.type} ${item.normalizedType}`.toLowerCase();

  return tokens.some((token) => searchable.includes(token.toLowerCase()));
}

export function guestLogEventOptions(
  catalog: GuestGameGuestLogCatalog,
  selectedValues: string[],
): GuestLogEventOption[] {
  const options = new Map<string, GuestLogEventOption>();

  for (const item of catalog.items) {
    const domainLabel = item.domains
      .slice(0, 2)
      .map((domain) => domain.domain)
      .join(", ");
    options.set(item.type, {
      value: item.type,
      label: item.mapping?.label
        ? `${item.mapping.label} · ${item.type}`
        : item.type,
      description: `${item.count} логов${
        domainLabel ? ` · ${domainLabel}` : ""
      }`,
    });
  }

  for (const fallback of fallbackGuestLogEventOptions) {
    if (!options.has(fallback.value)) {
      options.set(fallback.value, fallback);
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

export function missionVisibilityValue(value: string | null | undefined) {
  return String(value ?? "").toUpperCase() === "HIDDEN" ? "HIDDEN" : "VISIBLE";
}

export function ruleStatusPillTone(status: GuestGameStatus): StatusPillTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "DRAFT":
      return "info";
    case "PAUSED":
      return "warning";
    case "FINISHED":
      return "cyan";
    case "ARCHIVED":
      return "neutral";
  }
}

export function rewardStatusPillTone(status: GuestGameRewardStatus): StatusPillTone {
  switch (status) {
    case "PENDING":
      return "warning";
    case "APPROVED":
      return "info";
    case "PAID":
      return "success";
    case "CANCELED":
      return "neutral";
    case "EXPIRED":
      return "danger";
  }
}

export function rewardWalletPillTone(
  status: GuestGameReward["walletState"],
): StatusPillTone {
  switch (status) {
    case "WAITING_APPROVAL":
      return "warning";
    case "READY":
      return "success";
    case "DELIVERY_PROCESSING":
      return "info";
    case "REDEEMED":
      return "cyan";
    case "CANCELED":
      return "neutral";
    case "EXPIRED":
      return "danger";
  }
}

export function rewardRarityPillTone(
  rarity: GuestGameReward["rewardRarity"],
): StatusPillTone {
  switch (rarity) {
    case "rare":
      return "info";
    case "epic":
      return "purple";
    case "legendary":
      return "warning";
    case "common":
    default:
      return "neutral";
  }
}

export function isCheckInMission(mission: GuestGameMission) {
  return (
    mission.missionType === "CHECK_IN" || mission.triggerKind === "CHECK_IN"
  );
}

export function normalizeCheckInMissionForm(form: MissionForm): MissionForm {
  const rewardType = form.rewardType || "XP";
  const xpReward = form.xpReward && form.xpReward !== "0" ? form.xpReward : "0";

  return {
    ...form,
    missionType: "CHECK_IN",
    triggerKind: "CHECK_IN",
    rewardType,
    rewardAmount: rewardType === "XP" ? "0" : form.rewardAmount || "50",
    rewardLabel:
      form.rewardLabel ||
      (rewardType === "BONUS_BALANCE" ? "Бонусы за чекин" : "XP за чекин"),
    xpReward: rewardType === "XP" && xpReward === "0" ? "20" : xpReward,
    progressTarget: form.progressTarget || "1",
    progressUnit: form.progressUnit || "check_in",
    metricAggregation: form.metricAggregation || "count",
    metricEventTypes: form.metricEventTypes || "CHECK_IN",
    questEnabled: false,
    questSteps: [],
    requireLangameFact: false,
    denySameDayRepeat: false,
  };
}

export function nullable(value: string) {
  return value.trim() ? value.trim() : null;
}

export function storeScopeLabel(storeIds: string[], stores: Store[]) {
  if (!storeIds.length) {
    return "все клубы";
  }

  const names = storeIds
    .map((storeId) => stores.find((store) => store.id === storeId)?.name)
    .filter((value): value is string => Boolean(value));

  if (!names.length) {
    return `${storeIds.length} клуб.`;
  }

  return names.length > 2
    ? `${names.slice(0, 2).join(", ")} +${names.length - 2}`
    : names.join(", ");
}

export function csvList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function appendCsvToken(current: string, token: string) {
  return appendCsvTokens(current, [token]);
}

export function appendCsvTokens(current: string, tokens: string[]) {
  const values = csvList(current);
  const existing = new Set(values.map((value) => value.toLowerCase()));
  const nextValues = [...values];

  for (const token of tokens) {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      continue;
    }

    const key = normalizedToken.toLowerCase();

    if (existing.has(key)) {
      continue;
    }

    existing.add(key);
    nextValues.push(normalizedToken);
  }

  return nextValues.join(", ");
}

export function removeCsvToken(current: string, token: string) {
  const key = token.trim().toLowerCase();

  if (!key) {
    return csvList(current).join(", ");
  }

  return csvList(current)
    .filter((value) => value.toLowerCase() !== key)
    .join(", ");
}

export function csvHasToken(current: string, token: string) {
  const key = token.trim().toLowerCase();

  return (
    Boolean(key) &&
    csvList(current).some((value) => value.toLowerCase() === key)
  );
}

export function seasonStepRewardDefinition(
  step: SeasonLevelStepForm,
  track: "free" | "premium",
) {
  const legacyReward = track === "free" ? step.freeReward : step.premiumReward;
  const rewardType =
    (track === "free" ? step.freeRewardType : step.premiumRewardType) ??
    (legacyReward?.trim() ? "ADMIN_OTHER" : "");

  if (!rewardType) {
    return null;
  }

  const amountValue =
    track === "free" ? step.freeRewardAmount : step.premiumRewardAmount;
  const labelValue =
    track === "free" ? step.freeRewardLabel : step.premiumRewardLabel;
  const codeValue =
    track === "free" ? step.freeRewardCode : step.premiumRewardCode;
  const lootBoxIdValue =
    track === "free" ? step.freeRewardLootBoxId : step.premiumRewardLootBoxId;
  const lootBoxNameValue =
    track === "free"
      ? step.freeRewardLootBoxName
      : step.premiumRewardLootBoxName;
  const lootBoxRarityValue =
    track === "free"
      ? step.freeRewardLootBoxRarity
      : step.premiumRewardLootBoxRarity;
  const deliveryValue =
    track === "free" ? step.freeRewardDelivery : step.premiumRewardDelivery;
  const amount = optionalNumber(amountValue ?? "");
  const rawLabel = (labelValue ?? legacyReward ?? "").trim();
  const label =
    rawLabel ||
    (rewardType === "BONUS_BALANCE" && amount != null
      ? `${amount} бонусов`
      : rewardType === "PROMOCODE"
        ? "Промокод"
        : rewardType === "LOOT_BOX"
          ? (nullable(lootBoxNameValue ?? "") ?? "Лутбокс Battle Pass")
          : "Ручная награда");

  return {
    type: rewardType,
    label,
    amount,
    code: nullable(codeValue ?? ""),
    delivery: deliveryValue === "ADMIN" ? "ADMIN" : "AUTO",
    ...(rewardType === "LOOT_BOX"
      ? {
          lootBox: {
            id: nullable(lootBoxIdValue ?? ""),
            name: nullable(lootBoxNameValue ?? "") ?? label,
            caseRarity: lootBoxRarityValue ?? "common",
          },
        }
      : {}),
  };
}

export function seasonStepRewardLabel(
  step: SeasonLevelStepForm,
  track: "free" | "premium",
) {
  return seasonStepRewardDefinition(step, track)?.label ?? "";
}

export function bonusAmountFromRewardLabel(value: string | null | undefined) {
  const match = (value ?? "").match(
    /(\d[\d\s]*(?:[.,]\d+)?)\s*(?:бонус|балл)/i,
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
}

export function numeric(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function arrayRule(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function sortWeekdays(value: number[]) {
  const order = new Map(
    weekdayOptions.map((item, index) => [item.value, index]),
  );

  return Array.from(new Set(value))
    .filter((item) => order.has(item))
    .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
}

export function lootBoxPeriodicLimitPeriod(
  value: unknown,
): LootBoxPeriodicLimitPeriod | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";

  return raw === "DAILY" || raw === "WEEKLY" || raw === "MONTHLY" ? raw : null;
}

export function metricRule(value: unknown) {
  const record = asRecord(value);
  return asRecord(record.metric ?? record.progressMetric);
}

export function stringRule(value: unknown, key: string, fallback: string) {
  const raw = asRecord(value)[key];
  return typeof raw === "string" && raw.trim() ? raw : fallback;
}

export function stringListRule(value: unknown, key: string, fallback = "") {
  const raw = asRecord(value)[key];
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
      .join(", ");
  }

  return typeof raw === "string" && raw.trim() ? raw : fallback;
}

export function optionLabel(
  options: Array<{ value: string; label: string }>,
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function rewardTypeLabelFromValue(value: string) {
  return optionLabel(rewardTypeLabelOptions, value);
}

export function canonicalLootBoxRewardType(value: string) {
  const normalized = value.trim().toUpperCase();

  if (!normalized) {
    return value;
  }

  if (
    [
      "BONUS",
      "BONUS_POINTS",
      "BONUS_BALANCE",
      "CASHBACK",
      "LOYALTY_BONUS",
    ].includes(normalized)
  ) {
    return "BONUS_BALANCE";
  }

  return normalized;
}

export function tariffItemsByEndpoint(
  snapshots: GuestGameTariffSnapshotEndpoint[],
  endpointKey: string,
) {
  return (
    snapshots.find((snapshot) => snapshot.endpointKey === endpointKey)
      ?.typedItems ?? []
  );
}

export function tariffItemValue(
  item: GuestGameTariffSnapshotEndpoint["typedItems"][number],
) {
  return item.externalId ?? item.id;
}

export function tariffItemLabel(
  item: GuestGameTariffSnapshotEndpoint["typedItems"][number],
) {
  const label = item.label ?? item.name ?? item.externalId ?? item.id;
  return item.domain ? `${label} · ${item.domain}` : label;
}

export function tariffRuleSummary(value: unknown) {
  const record = asRecord(value);
  const count = [
    record.tariffGroupId,
    record.tariffPeriodId,
    record.tariffTypeId,
  ].filter((item) => typeof item === "string" && item.trim()).length;

  return count ? `тарифы: ${count}` : "любой тариф";
}

export function guestLogRuleSummary(conditions: unknown, antiFraud?: unknown) {
  const conditionRecord = asRecord(conditions);
  const antiFraudRecord = asRecord(antiFraud);
  const allowedCount = arrayRule(conditionRecord.guestLogTypes).filter(
    (item) => typeof item === "string" && item.trim(),
  ).length;
  const blockedCount = [
    ...arrayRule(conditionRecord.blockedGuestLogTypes),
    ...arrayRule(antiFraudRecord.blockedGuestLogTypes),
  ].filter((item) => typeof item === "string" && item.trim()).length;

  if (allowedCount && blockedCount) {
    return `logs: ${allowedCount} / anti-fraud ${blockedCount}`;
  }
  if (allowedCount) {
    return `logs: ${allowedCount}`;
  }
  if (blockedCount) {
    return `anti-fraud logs: ${blockedCount}`;
  }
  return "любой log";
}

export function missionQuestSteps(value: unknown) {
  const steps = asRecord(value).questSteps;
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps
    .map((item, index) => {
      const record = asRecord(item);
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const id =
        typeof record.id === "string" && record.id.trim()
          ? record.id.trim()
          : `step-${index + 1}`;
      const missionId =
        typeof record.missionId === "string" && record.missionId.trim()
          ? record.missionId.trim()
          : typeof record.templateMissionId === "string" &&
              record.templateMissionId.trim()
            ? record.templateMissionId.trim()
            : "";

      return title ? { id, title, missionId } : null;
    })
    .filter((item): item is { id: string; title: string; missionId: string } =>
      Boolean(item),
    );
}

export function lootBoxPrizesToForm(
  value: unknown,
  fallback: Pick<
    LootBoxPrizeForm,
    "rewardType" | "rewardAmount" | "rewardLabel"
  >,
): LootBoxPrizeForm[] {
  const record = asRecord(value);
  const prizes = Array.isArray(record.prizes) ? record.prizes : [];
  const items = Array.isArray(record.items) ? record.items : [];
  const source = prizes.length ? prizes : items;
  const mapped = source
    .map((item, index) => lootBoxPrizeFromRuleItem(item, index, fallback))
    .filter((item): item is LootBoxPrizeForm => Boolean(item));

  if (mapped.length) {
    return mapped;
  }

  if (fallback.rewardLabel || fallback.rewardType || fallback.rewardAmount) {
    return [
      {
        id: "fallback-prize",
        rewardType: canonicalLootBoxRewardType(
          fallback.rewardType || "PROMOCODE",
        ),
        rewardAmount: fallback.rewardAmount || "0",
        rewardLabel: fallback.rewardLabel || "Награда лутбокса",
        chancePercent: "100",
        noBonus: false,
        visualMode: "AUTO",
        iconKey: defaultLootBoxPrizeIconKey(fallback.rewardType),
        imageUrl: "",
        borderColor: "",
        textColor: "",
        backgroundColor: "",
      },
    ];
  }

  return defaultLootBoxPrizes.map((prize) => ({ ...prize }));
}

export function lootBoxPrizeFromRuleItem(
  value: unknown,
  index: number,
  fallback: Pick<
    LootBoxPrizeForm,
    "rewardType" | "rewardAmount" | "rewardLabel"
  >,
): LootBoxPrizeForm | null {
  const record = asRecord(value);
  const rewardLabel = String(
    record.rewardLabel ?? record.label ?? fallback.rewardLabel ?? "",
  ).trim();

  if (!rewardLabel) {
    return null;
  }

  const rewardType = canonicalLootBoxRewardType(
    String(
      record.rewardType ?? record.type ?? fallback.rewardType ?? "PROMOCODE",
    ),
  );
  const noBonus = rewardType === "MERCH" && record.noBonus === true;

  return {
    id: `rule-prize-${index}`,
    rewardType,
    rewardAmount: noBonus
      ? "0"
      : numberFormValue(
          record.rewardAmount ?? record.amount ?? fallback.rewardAmount ?? "0",
        ),
    rewardLabel,
    chancePercent: numberFormValue(
      record.chancePercent ?? record.weight ?? record.probability ?? "0",
    ),
    noBonus,
    visualMode: lootBoxPrizeVisualMode(record.visualMode),
    iconKey: normalizeLootBoxPrizeIconKey(
      typeof record.iconKey === "string" ? record.iconKey : null,
      String(record.rewardType ?? record.type ?? fallback.rewardType ?? ""),
    ),
    imageUrl:
      typeof record.imageUrl === "string" &&
      record.imageUrl.startsWith("/api/guest-game/media/")
        ? record.imageUrl
        : "",
    borderColor:
      typeof record.borderColor === "string"
        ? (normalizeLootBoxPrizeColor(record.borderColor) ?? "")
        : "",
    textColor:
      typeof record.textColor === "string"
        ? (normalizeLootBoxPrizeColor(record.textColor) ?? "")
        : "",
    backgroundColor:
      typeof record.backgroundColor === "string"
        ? (normalizeLootBoxPrizeColor(record.backgroundColor) ?? "")
        : "",
  };
}

export function lootBoxPrizeVisualMode(value: unknown): LootBoxPrizeVisualMode {
  return value === "ICON" || value === "IMAGE" ? value : "AUTO";
}

export function lootBoxCaseRarity(value: unknown): LootBoxCaseRarity {
  const record = asRecord(value);
  const raw = record.caseRarity ?? record.skinRarity ?? record.lootBoxRarity;

  return raw === "rare" ||
    raw === "epic" ||
    raw === "legendary" ||
    raw === "common"
    ? raw
    : "common";
}

export function numberFormValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatChanceNumber(parsed) : "";
}

export function primaryLootBoxPrize(form: LootBoxForm) {
  const prize = form.prizes.find(
    (item) =>
      item.rewardLabel.trim() ||
      item.rewardAmount.trim() ||
      item.rewardType.trim(),
  );

  return {
    rewardType: canonicalLootBoxRewardType(
      prize?.rewardType || form.rewardType || "PROMOCODE",
    ),
    rewardAmount: prize?.rewardAmount || form.rewardAmount || "0",
    rewardLabel: prize?.rewardLabel || form.rewardLabel || "Награда лутбокса",
  };
}

export function formatChanceNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.?0+$/, "");
}

export function jsonText(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatBudgetAmount(value: number | null | undefined) {
  return value == null ? "Безлимит" : formatMoney(value);
}

export function sessionTypeLabel(value: string | null) {
  const normalized = normalizeUiSessionType(value);

  if (normalized === "unknown" || normalized === "unknown_session") {
    return "тип сессии неизвестен";
  }

  return (
    sessionTypeOptions.find((option) => option.value === normalized)?.label ??
    value ??
    "любой тип"
  );
}

export function trackingId(prefix: string, value: string | null | undefined) {
  const compact = (value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();

  return `${prefix}-${compact || "NEW"}`;
}

export function normalizeUiSessionType(value: string | null | undefined) {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (
    ["any", "all", "any_session", "любая", "любой", "любая_сессия"].includes(
      normalized,
    )
  ) {
    return "";
  }

  if (
    [
      "packet_hours",
      "package_or_subscription",
      "package_or_subscription_session",
      "packet",
      "package",
      "package_hours",
      "subscription",
      "membership",
      "abonement",
      "abonnement",
      "абонемент",
    ].includes(normalized)
  ) {
    return "packet_hours";
  }

  if (
    [
      "hourly",
      "hourly_session",
      "regular_session",
      "regular",
      "common",
      "default",
    ].includes(normalized)
  ) {
    return "regular_session";
  }

  return normalized;
}

export function formatDate(value: string | null) {
  if (!value) {
    return "без даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const guestGameMissionDefinitionVersion = 2;

export const guestGameMissionTaskTypes = [
  'APP_OPEN',
  'PLAY_TIME',
  'PRODUCT_PURCHASE',
  'BALANCE_TOPUP',
  'CHECK_IN',
] as const;

export type GuestGameMissionTaskType =
  (typeof guestGameMissionTaskTypes)[number];

export type GuestGameMissionEvaluationPolicy =
  | 'LIVE_PRIMARY'
  | 'LEDGER_SUPPLEMENTAL';

export type GuestGameMissionWizardDto = {
  name?: string;
  status?: string;
  taskType?: string;
  visibility?: string;
  audienceId?: string | null;
  storeIds?: string[];
  periodFrom?: string | null;
  periodTo?: string | null;
  conditions?: Record<string, unknown> | null;
  reward?: Record<string, unknown> | null;
  appearance?: Record<string, unknown> | null;
  note?: string | null;
};

export type GuestGameMissionWizardReadiness = {
  ready: boolean;
  definitionVersion: 2;
  taskType: GuestGameMissionTaskType;
  evaluationPolicy: GuestGameMissionEvaluationPolicy;
  source: 'LIVE' | 'ACTIVITY_LEDGER';
  sourceLabel: string;
  blockers: string[];
  warnings: string[];
};

export function missionTaskType(value: unknown): GuestGameMissionTaskType {
  const normalized = stringValue(value)?.toUpperCase();
  if (
    !normalized ||
    !guestGameMissionTaskTypes.includes(normalized as GuestGameMissionTaskType)
  ) {
    throw new BadRequestException('Неизвестный тип задания мастера.');
  }
  return normalized as GuestGameMissionTaskType;
}

export function missionEvaluationPolicy(
  taskType: GuestGameMissionTaskType,
): GuestGameMissionEvaluationPolicy {
  return taskType === 'BALANCE_TOPUP' ? 'LEDGER_SUPPLEMENTAL' : 'LIVE_PRIMARY';
}

export function missionWizardTrigger(taskType: GuestGameMissionTaskType) {
  const values: Record<GuestGameMissionTaskType, string> = {
    APP_OPEN: 'APP_OPEN',
    PLAY_TIME: 'PLAY_HOUR',
    PRODUCT_PURCHASE: 'PRODUCT_PURCHASE',
    BALANCE_TOPUP: 'BALANCE_TOPUP',
    CHECK_IN: 'CHECK_IN',
  };
  return values[taskType];
}

export function normalizeMissionWizardConditions(
  dto: GuestGameMissionWizardDto,
): Prisma.InputJsonObject {
  const taskType = missionTaskType(dto.taskType);
  const source = objectValue(dto.conditions);
  const metric = objectValue(source.metric);
  const appearance = objectValue(dto.appearance);
  const productMatch = enumValue(metric.productMatch, ['ANY', 'ALL'], 'ANY');
  const purchaseSource = enumValue(
    source.purchaseSource,
    ['PRODUCT', 'CATEGORY'],
    'PRODUCT',
  );
  const categoryCatalogSource = enumValue(
    source.categoryCatalogSource ?? metric.categoryCatalogSource,
    ['LANGAME', 'LEETPLUS'],
    'LANGAME',
  );
  const amountMode = enumValue(
    metric.amountMode,
    ['NONE', 'SINGLE_MINIMUM', 'PERIOD_TOTAL'],
    'NONE',
  );
  const sessionType = enumValue(
    source.sessionType,
    ['ANY', 'HOURLY', 'PACKAGE_OR_SUBSCRIPTION'],
    'ANY',
  );
  const eventTypes: Record<GuestGameMissionTaskType, string[]> = {
    APP_OPEN: ['APP_OPEN'],
    PLAY_TIME: ['PLAY_HOUR', 'SESSION_STOP'],
    PRODUCT_PURCHASE: ['PRODUCT_PURCHASE', 'BAR_PURCHASE'],
    BALANCE_TOPUP: ['BALANCE_TOPUP'],
    CHECK_IN: ['CHECK_IN'],
  };

  const normalizedMetric: Record<string, unknown> = {
    ...metric,
    eventTypes: eventTypes[taskType],
  };

  if (taskType === 'PRODUCT_PURCHASE') {
    normalizedMetric.purchaseSource = purchaseSource;
    normalizedMetric.categoryCatalogSource =
      purchaseSource === 'CATEGORY' ? categoryCatalogSource : null;
    normalizedMetric.productMatch = productMatch;
    normalizedMetric.amountMode = amountMode;
    normalizedMetric.productIds =
      purchaseSource === 'PRODUCT' ? stringArray(metric.productIds) : [];
    normalizedMetric.externalProductIds =
      purchaseSource === 'PRODUCT'
        ? stringArray(metric.externalProductIds)
        : [];
    normalizedMetric.categoryIds =
      purchaseSource === 'CATEGORY' ? stringArray(metric.categoryIds) : [];
    normalizedMetric.externalCategoryKeys =
      purchaseSource === 'CATEGORY'
        ? stringArray(metric.externalCategoryKeys)
        : [];
    normalizedMetric.aggregation =
      amountMode === 'PERIOD_TOTAL'
        ? 'sum'
        : (stringValue(metric.aggregation) ?? 'count');
    if (amountMode === 'PERIOD_TOTAL') {
      normalizedMetric.target =
        numberValue(metric.totalAmount) ?? numberValue(metric.target) ?? 1;
    } else if (productMatch === 'ALL') {
      normalizedMetric.target = Math.max(
        1,
        purchaseSource === 'CATEGORY'
          ? stringArray(metric.categoryIds).length
          : stringArray(metric.productIds).length,
        purchaseSource === 'CATEGORY'
          ? 0
          : stringArray(metric.externalProductIds).length,
      );
    } else {
      normalizedMetric.target = 1;
    }
  }

  if (taskType === 'BALANCE_TOPUP') {
    const topupMode = enumValue(
      metric.topupMode,
      ['SINGLE', 'COUNT', 'PERIOD_TOTAL'],
      'SINGLE',
    );
    const amountComparison = enumValue(
      metric.amountComparison,
      ['EXACT', 'AT_LEAST'],
      'AT_LEAST',
    );
    const amount = numberValue(metric.amount) ?? 0;
    normalizedMetric.topupMode = topupMode;
    normalizedMetric.amountComparison = amountComparison;
    normalizedMetric.aggregation =
      topupMode === 'PERIOD_TOTAL'
        ? 'sum'
        : topupMode === 'SINGLE'
          ? 'exists'
          : 'count';
    normalizedMetric.target =
      topupMode === 'PERIOD_TOTAL'
        ? (numberValue(metric.totalAmount) ?? numberValue(metric.target) ?? 1)
        : topupMode === 'COUNT'
          ? (numberValue(metric.count) ?? numberValue(metric.target) ?? 1)
          : 1;
    if (topupMode !== 'PERIOD_TOTAL' && amount > 0) {
      if (amountComparison === 'EXACT') {
        normalizedMetric.exactSpendAmount = amount;
        delete normalizedMetric.minSpendAmount;
      } else {
        normalizedMetric.minSpendAmount = amount;
        delete normalizedMetric.exactSpendAmount;
      }
    }
  }

  if (taskType === 'CHECK_IN') {
    const checkInMode = enumValue(
      metric.checkInMode,
      ['SINGLE', 'COUNT', 'PERIOD', 'STREAK'],
      'SINGLE',
    );
    normalizedMetric.checkInMode = checkInMode;
    normalizedMetric.aggregation =
      checkInMode === 'STREAK' ? 'streak' : 'count';
    normalizedMetric.target =
      checkInMode === 'SINGLE'
        ? 1
        : (numberValue(checkInMode === 'STREAK' ? metric.days : metric.count) ??
          numberValue(metric.target) ??
          1);
  }

  return {
    ...jsonObject(source),
    schemaVersion: guestGameMissionDefinitionVersion,
    source: 'mission_wizard',
    taskType,
    visibility:
      stringValue(dto.visibility)?.toUpperCase() === 'HIDDEN'
        ? 'HIDDEN'
        : 'VISIBLE',
    sessionType: taskType === 'APP_OPEN' ? 'ANY' : sessionType,
    ...(taskType === 'PRODUCT_PURCHASE'
      ? {
          purchaseSource,
          ...(purchaseSource === 'CATEGORY' ? { categoryCatalogSource } : {}),
        }
      : {}),
    metric:
      taskType === 'APP_OPEN'
        ? jsonObject({
            eventTypes: ['APP_OPEN'],
            aggregation: 'exists',
            target: 1,
            unit: 'открытие',
          })
        : jsonObject(normalizedMetric),
    presentation: jsonObject({
      ...jsonObject(appearance),
      description: stringValue(appearance.description),
      actionText: stringValue(appearance.actionText),
      theme: stringValue(appearance.theme),
      icon: stringValue(appearance.icon),
      coverUrl: stringValue(appearance.coverUrl),
    }),
  };
}

export function validateMissionWizard(
  dto: GuestGameMissionWizardDto,
): GuestGameMissionWizardReadiness {
  const taskType = missionTaskType(dto.taskType);
  const conditions = normalizeMissionWizardConditions(dto);
  const metric = objectValue(conditions.metric);
  const reward = objectValue(dto.reward);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!stringValue(dto.name)) blockers.push('Укажите название задания.');
  if (!stringArray(dto.storeIds).length)
    blockers.push('Выберите хотя бы один клуб.');
  if (!stringValue(dto.periodFrom)) blockers.push('Укажите начало задания.');
  if (!stringValue(dto.periodTo)) blockers.push('Укажите окончание задания.');

  const from = dateValue(dto.periodFrom);
  const to = dateValue(dto.periodTo);
  if (from && to && from >= to) {
    blockers.push('Окончание задания должно быть позже начала.');
  }

  const target = numberValue(metric.target);
  if (!target || target <= 0) blockers.push('Цель должна быть больше нуля.');

  if (taskType === 'PRODUCT_PURCHASE') {
    const purchaseSource = stringValue(conditions.purchaseSource);
    const selection =
      purchaseSource === 'CATEGORY'
        ? stringArray(metric.categoryIds)
        : [
            ...stringArray(metric.productIds),
            ...stringArray(metric.externalProductIds),
          ];
    if (!selection.length) {
      blockers.push(
        purchaseSource === 'CATEGORY'
          ? 'Выберите категории для задания.'
          : 'Выберите товары для задания.',
      );
    }
  }

  if (taskType === 'BALANCE_TOPUP') {
    warnings.push(
      'Пополнение определяется внутри домена Langame независимо от конкретного клуба.',
    );
  }

  if (taskType === 'PLAY_TIME') {
    const conditionsRecord = objectValue(dto.conditions);
    if (
      stringArray(conditionsRecord.tariffGroupIds).length ||
      stringArray(conditionsRecord.tariffPeriodIds).length ||
      stringArray(conditionsRecord.tariffTypeIds).length
    ) {
      blockers.push('Точные тарифные справочники пока находятся в разработке.');
    }
  }

  const rewardType = stringValue(reward.type)?.toUpperCase() ?? 'NONE';
  if (rewardType === 'LOOTBOX' && !stringValue(reward.lootBoxId)) {
    blockers.push('Выберите наградной лутбокс.');
  }
  if (rewardType === 'PROMOCODE' && !stringValue(reward.promoCodeId)) {
    blockers.push('Выберите промокод.');
  }

  const evaluationPolicy = missionEvaluationPolicy(taskType);
  return {
    ready: blockers.length === 0,
    definitionVersion: guestGameMissionDefinitionVersion,
    taskType,
    evaluationPolicy,
    source:
      evaluationPolicy === 'LEDGER_SUPPLEMENTAL' ? 'ACTIVITY_LEDGER' : 'LIVE',
    sourceLabel:
      evaluationPolicy === 'LEDGER_SUPPLEMENTAL'
        ? 'Игровой журнал, второй боевой слой'
        : 'Текущий боевой pipeline',
    blockers,
    warnings,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => item !== undefined && item !== null,
    ),
  ) as Prisma.InputJsonObject;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((item): item is string => Boolean(item))
    : [];
}

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown) {
  const text = stringValue(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  fallback: T,
) {
  const normalized = stringValue(value)?.toUpperCase();
  return values.includes(normalized as T) ? (normalized as T) : fallback;
}

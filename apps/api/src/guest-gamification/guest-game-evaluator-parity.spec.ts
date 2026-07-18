import {
  evaluateGuestGameProgress,
  type GuestGameProgressEvent,
  type GuestGameProgressRule,
} from './guest-game-progress';
import {
  evaluateGuestGameLedgerRule,
  relevantGuestGameFacts,
  type GuestGameLedgerFact,
  type GuestGameLedgerRule,
} from './guest-game-rule-evaluator';

const STORE_ID = 'store-pushkinskaya';
const EXTERNAL_DOMAIN = '46.langamepro.ru';
const TIME_ZONE = 'Asia/Yekaterinburg';
const ACTIVATED_AT = new Date('2026-07-01T00:00:00.000Z');

type PairedEvent = {
  id: string;
  liveType: string;
  ledgerType: string;
  happenedAt: string;
  sessionType?: string;
  durationMinutes?: number;
  amount?: number;
  productId?: string;
  externalProductId?: string;
  categoryId?: string;
  externalCategoryKey?: string;
};

type ParityScenario = {
  name: string;
  triggerKind: string;
  sessionType?: string | null;
  progressTarget: number;
  progressUnit: string;
  conditions: Record<string, unknown>;
  events: PairedEvent[];
  evaluatedAt?: string;
  expectedCompleted: boolean;
  expectedCurrent: number;
};

function liveRule(scenario: ParityScenario): GuestGameProgressRule {
  return {
    triggerKind: scenario.triggerKind,
    progressTarget: scenario.progressTarget,
    progressUnit: scenario.progressUnit,
    conditions: {
      ...scenario.conditions,
      ...(scenario.sessionType ? { sessionType: scenario.sessionType } : {}),
    },
    storeIds: [STORE_ID],
    externalDomains: [EXTERNAL_DOMAIN],
    periodFrom: ACTIVATED_AT,
    timeZone: TIME_ZONE,
  };
}

function ledgerRule(scenario: ParityScenario): GuestGameLedgerRule {
  return {
    type: 'MISSION',
    id: `parity:${scenario.name}`,
    title: scenario.name,
    triggerKind: scenario.triggerKind,
    sessionType: scenario.sessionType ?? null,
    createdAt: ACTIVATED_AT,
    activatedAt: ACTIVATED_AT,
    periodFrom: ACTIVATED_AT,
    periodTo: null,
    periodRules: scenario.conditions,
    storeIds: [STORE_ID],
    externalDomains: [EXTERNAL_DOMAIN],
    progressTarget: scenario.progressTarget,
    progressUnit: scenario.progressUnit,
  };
}

function liveEvent(event: PairedEvent): GuestGameProgressEvent {
  return {
    eventType: event.liveType,
    occurredAt: new Date(event.happenedAt),
    sourceFactId: event.id,
    storeId: event.ledgerType === 'BALANCE_TOPUP' ? null : STORE_ID,
    externalDomain: EXTERNAL_DOMAIN,
    sessionType: event.sessionType ?? null,
    sessionMinutes: event.durationMinutes ?? null,
    spendAmount: event.amount ?? null,
    productId: event.productId ?? null,
    externalProductId: event.externalProductId ?? null,
    categoryId: event.categoryId ?? null,
    externalCategoryKey: event.externalCategoryKey ?? null,
  };
}

function ledgerFact(event: PairedEvent): GuestGameLedgerFact {
  const happenedAt = new Date(event.happenedAt);
  return {
    id: event.id,
    factType: event.ledgerType,
    confidence: 'EXACT',
    happenedAt,
    createdAt: happenedAt,
    storeId: event.ledgerType === 'BALANCE_TOPUP' ? null : STORE_ID,
    externalDomain: EXTERNAL_DOMAIN,
    tariffName: null,
    tariffType: event.sessionType ?? null,
    amount: event.amount ?? null,
    durationMinutes: event.durationMinutes ?? null,
    evidence:
      event.productId ||
      event.externalProductId ||
      event.categoryId ||
      event.externalCategoryKey
        ? {
            // PRODUCT_EXPENSE stores the Langame identifier in productId.
            productId: event.externalProductId ?? event.productId ?? null,
            categoryId: event.categoryId ?? null,
            externalCategoryKey: event.externalCategoryKey ?? null,
          }
        : null,
    store:
      event.ledgerType === 'BALANCE_TOPUP' ? null : { timeZone: TIME_ZONE },
  };
}

const scenarios: ParityScenario[] = [
  {
    name: 'PLAY_TIME ANY combines hourly and package minutes',
    triggerKind: 'PLAY_HOUR',
    sessionType: 'ANY',
    progressTarget: 60,
    progressUnit: 'minute',
    conditions: {
      metric: {
        aggregation: 'duration',
        eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
        target: 60,
      },
    },
    events: [
      {
        id: 'play-any-hourly',
        liveType: 'PLAY_HOUR',
        ledgerType: 'HOURLY_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-10T08:00:00.000Z',
        sessionType: 'regular_session',
        durationMinutes: 30,
      },
      {
        id: 'play-any-package',
        liveType: 'SESSION_STOP',
        ledgerType: 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        sessionType: 'packet_hours',
        durationMinutes: 35,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 65,
  },
  {
    name: 'PLAY_TIME HOURLY ignores package minutes',
    triggerKind: 'PLAY_HOUR',
    sessionType: 'HOURLY',
    progressTarget: 60,
    progressUnit: 'minute',
    conditions: {
      metric: {
        aggregation: 'duration',
        eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
        target: 60,
      },
    },
    events: [
      {
        id: 'play-hourly-package-noise',
        liveType: 'SESSION_STOP',
        ledgerType: 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-10T08:00:00.000Z',
        sessionType: 'packet_hours',
        durationMinutes: 120,
      },
      {
        id: 'play-hourly-valid',
        liveType: 'PLAY_HOUR',
        ledgerType: 'HOURLY_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        sessionType: 'regular_session',
        durationMinutes: 60,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 60,
  },
  {
    name: 'PLAY_TIME PACKAGE ignores hourly minutes',
    triggerKind: 'PLAY_HOUR',
    sessionType: 'PACKAGE_OR_SUBSCRIPTION',
    progressTarget: 90,
    progressUnit: 'minute',
    conditions: {
      metric: {
        aggregation: 'duration',
        eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
        target: 90,
      },
    },
    events: [
      {
        id: 'play-package-hourly-noise',
        liveType: 'PLAY_HOUR',
        ledgerType: 'HOURLY_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-10T08:00:00.000Z',
        sessionType: 'regular_session',
        durationMinutes: 120,
      },
      {
        id: 'play-package-valid',
        liveType: 'SESSION_STOP',
        ledgerType: 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        sessionType: 'packet_hours',
        durationMinutes: 90,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 90,
  },
  {
    name: 'PLAY_TIME applies minimum session duration',
    triggerKind: 'PLAY_HOUR',
    sessionType: 'ANY',
    progressTarget: 60,
    progressUnit: 'minute',
    conditions: {
      metric: {
        aggregation: 'duration',
        eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
        minSessionMinutes: 60,
        target: 60,
      },
    },
    events: [
      {
        id: 'play-too-short',
        liveType: 'PLAY_HOUR',
        ledgerType: 'HOURLY_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-10T08:00:00.000Z',
        sessionType: 'regular_session',
        durationMinutes: 59,
      },
      {
        id: 'play-long-enough',
        liveType: 'SESSION_STOP',
        ledgerType: 'PACKAGE_OR_SUBSCRIPTION_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        sessionType: 'packet_hours',
        durationMinutes: 60,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 60,
  },
  {
    name: 'PLAY_TIME applies club-local weekday and time window',
    triggerKind: 'PLAY_HOUR',
    sessionType: 'ANY',
    progressTarget: 60,
    progressUnit: 'minute',
    conditions: {
      weekdays: [1],
      hours: ['09:00-12:00'],
      metric: {
        aggregation: 'duration',
        eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
        target: 60,
      },
    },
    events: [
      {
        id: 'play-sunday',
        liveType: 'PLAY_HOUR',
        ledgerType: 'HOURLY_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-12T04:30:00.000Z',
        sessionType: 'regular_session',
        durationMinutes: 120,
      },
      {
        id: 'play-monday-too-early',
        liveType: 'PLAY_HOUR',
        ledgerType: 'HOURLY_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-13T02:30:00.000Z',
        sessionType: 'regular_session',
        durationMinutes: 120,
      },
      {
        id: 'play-monday-valid',
        liveType: 'PLAY_HOUR',
        ledgerType: 'HOURLY_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-13T04:30:00.000Z',
        sessionType: 'regular_session',
        durationMinutes: 60,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 60,
  },
  {
    name: 'PLAY_TIME stays incomplete before the target',
    triggerKind: 'PLAY_HOUR',
    sessionType: 'ANY',
    progressTarget: 60,
    progressUnit: 'minute',
    conditions: {
      metric: {
        aggregation: 'duration',
        eventTypes: ['PLAY_HOUR', 'SESSION_STOP'],
        target: 60,
      },
    },
    events: [
      {
        id: 'play-partial',
        liveType: 'PLAY_HOUR',
        ledgerType: 'HOURLY_PLAY_TIME_ACCUMULATED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        sessionType: 'regular_session',
        durationMinutes: 30,
      },
    ],
    expectedCompleted: false,
    expectedCurrent: 30,
  },
  {
    name: 'PRODUCT_PURCHASE ANY accepts one selected product',
    triggerKind: 'PRODUCT_PURCHASE',
    progressTarget: 1,
    progressUnit: 'purchase',
    conditions: {
      metric: {
        aggregation: 'count',
        eventTypes: ['PRODUCT_PURCHASE'],
        productMatch: 'ANY',
        productIds: ['leetplus-burn'],
        externalProductIds: ['langame-burn'],
        productRefs: [
          {
            productId: 'leetplus-burn',
            externalProductId: 'langame-burn',
          },
        ],
        target: 1,
      },
    },
    events: [
      {
        id: 'purchase-other',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T08:00:00.000Z',
        productId: 'pizza',
        amount: 499,
      },
      {
        id: 'purchase-burn',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        productId: 'leetplus-burn',
        externalProductId: 'langame-burn',
        amount: 219,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 1,
  },
  {
    name: 'PRODUCT_PURCHASE CATEGORY ANY accepts one selected category',
    triggerKind: 'PRODUCT_PURCHASE',
    progressTarget: 1,
    progressUnit: 'purchase',
    conditions: {
      purchaseSource: 'CATEGORY',
      categoryCatalogSource: 'LANGAME',
      metric: {
        aggregation: 'count',
        eventTypes: ['PRODUCT_PURCHASE'],
        purchaseSource: 'CATEGORY',
        categoryCatalogSource: 'LANGAME',
        productMatch: 'ANY',
        externalCategoryKeys: ['46.langamepro.ru:7'],
        target: 1,
      },
    },
    events: [
      {
        id: 'category-any-other',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T08:00:00.000Z',
        externalCategoryKey: '46.langamepro.ru:8',
        amount: 199,
      },
      {
        id: 'category-any-selected',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        externalCategoryKey: '46.langamepro.ru:7',
        amount: 219,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 1,
  },
  {
    name: 'PRODUCT_PURCHASE CATEGORY ALL covers every selected category',
    triggerKind: 'PRODUCT_PURCHASE',
    progressTarget: 2,
    progressUnit: 'purchase',
    conditions: {
      purchaseSource: 'CATEGORY',
      categoryCatalogSource: 'LANGAME',
      metric: {
        aggregation: 'count',
        eventTypes: ['PRODUCT_PURCHASE'],
        purchaseSource: 'CATEGORY',
        categoryCatalogSource: 'LANGAME',
        productMatch: 'ALL',
        externalCategoryKeys: ['46.langamepro.ru:7', '46.langamepro.ru:12'],
        categorySelections: [
          { id: 'energy', externalCategoryKeys: ['46.langamepro.ru:7'] },
          { id: 'rental', externalCategoryKeys: ['46.langamepro.ru:12'] },
        ],
        target: 2,
      },
    },
    events: [
      {
        id: 'category-all-energy',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T08:00:00.000Z',
        externalCategoryKey: '46.langamepro.ru:7',
        amount: 219,
      },
      {
        id: 'category-all-rental',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        externalCategoryKey: '46.langamepro.ru:12',
        amount: 399,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 2,
  },
  {
    name: 'PRODUCT_PURCHASE CATEGORY ALL stays incomplete with partial coverage',
    triggerKind: 'PRODUCT_PURCHASE',
    progressTarget: 2,
    progressUnit: 'purchase',
    conditions: {
      purchaseSource: 'CATEGORY',
      categoryCatalogSource: 'LANGAME',
      metric: {
        aggregation: 'count',
        eventTypes: ['PRODUCT_PURCHASE'],
        purchaseSource: 'CATEGORY',
        categoryCatalogSource: 'LANGAME',
        productMatch: 'ALL',
        externalCategoryKeys: ['46.langamepro.ru:7', '46.langamepro.ru:12'],
        categorySelections: [
          { id: 'energy', externalCategoryKeys: ['46.langamepro.ru:7'] },
          { id: 'rental', externalCategoryKeys: ['46.langamepro.ru:12'] },
        ],
        target: 2,
      },
    },
    events: [
      {
        id: 'category-all-partial',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        externalCategoryKey: '46.langamepro.ru:7',
        amount: 219,
      },
    ],
    expectedCompleted: false,
    expectedCurrent: 1,
  },
  {
    name: 'PRODUCT_PURCHASE ALL covers products across separate purchases',
    triggerKind: 'PRODUCT_PURCHASE',
    progressTarget: 2,
    progressUnit: 'purchase',
    conditions: {
      metric: {
        aggregation: 'count',
        eventTypes: ['PRODUCT_PURCHASE'],
        productMatch: 'ALL',
        productIds: ['leetplus-burn', 'leetplus-pizza'],
        externalProductIds: ['langame-burn', 'langame-pizza'],
        productRefs: [
          {
            productId: 'leetplus-burn',
            externalProductId: 'langame-burn',
          },
          {
            productId: 'leetplus-pizza',
            externalProductId: 'langame-pizza',
          },
        ],
        target: 2,
      },
    },
    events: [
      {
        id: 'purchase-all-burn',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T08:00:00.000Z',
        productId: 'leetplus-burn',
        externalProductId: 'langame-burn',
        amount: 219,
      },
      {
        id: 'purchase-all-pizza',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        productId: 'leetplus-pizza',
        externalProductId: 'langame-pizza',
        amount: 499,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 2,
  },
  {
    name: 'PRODUCT_PURCHASE ALL remains incomplete with one missing product',
    triggerKind: 'PRODUCT_PURCHASE',
    progressTarget: 2,
    progressUnit: 'purchase',
    conditions: {
      metric: {
        aggregation: 'count',
        eventTypes: ['PRODUCT_PURCHASE'],
        productMatch: 'ALL',
        productIds: ['leetplus-burn', 'leetplus-pizza'],
        externalProductIds: ['langame-burn', 'langame-pizza'],
        productRefs: [
          {
            productId: 'leetplus-burn',
            externalProductId: 'langame-burn',
          },
          {
            productId: 'leetplus-pizza',
            externalProductId: 'langame-pizza',
          },
        ],
        target: 2,
      },
    },
    events: [
      {
        id: 'purchase-all-incomplete',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        productId: 'leetplus-burn',
        externalProductId: 'langame-burn',
        amount: 219,
      },
    ],
    expectedCompleted: false,
    expectedCurrent: 1,
  },
  {
    name: 'PRODUCT_PURCHASE single minimum filters smaller purchases',
    triggerKind: 'PRODUCT_PURCHASE',
    progressTarget: 1,
    progressUnit: 'purchase',
    conditions: {
      metric: {
        aggregation: 'count',
        eventTypes: ['PRODUCT_PURCHASE'],
        minSpendAmount: 200,
        target: 1,
      },
    },
    events: [
      {
        id: 'purchase-small',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T08:00:00.000Z',
        productId: 'cola',
        amount: 199,
      },
      {
        id: 'purchase-minimum',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        productId: 'burn',
        amount: 200,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 1,
  },
  {
    name: 'PRODUCT_PURCHASE exact amount ignores a different purchase amount',
    triggerKind: 'PRODUCT_PURCHASE',
    progressTarget: 1,
    progressUnit: 'purchase',
    conditions: {
      metric: {
        aggregation: 'count',
        eventTypes: ['PRODUCT_PURCHASE'],
        exactSpendAmount: 200,
        target: 1,
      },
    },
    events: [
      {
        id: 'purchase-exact-noise',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T08:00:00.000Z',
        productId: 'cola',
        amount: 199,
      },
      {
        id: 'purchase-exact-valid',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        productId: 'burn',
        amount: 200,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 1,
  },
  {
    name: 'PRODUCT_PURCHASE period total sums separate purchases',
    triggerKind: 'PRODUCT_PURCHASE',
    progressTarget: 500,
    progressUnit: 'rub',
    conditions: {
      metric: {
        aggregation: 'sum',
        eventTypes: ['PRODUCT_PURCHASE'],
        productMatch: 'ANY',
        productIds: ['burn'],
        target: 500,
      },
    },
    events: [
      {
        id: 'purchase-total-noise',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T07:00:00.000Z',
        productId: 'pizza',
        amount: 1_000,
      },
      {
        id: 'purchase-total-200',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T08:00:00.000Z',
        productId: 'burn',
        amount: 200,
      },
      {
        id: 'purchase-total-300',
        liveType: 'PRODUCT_PURCHASE',
        ledgerType: 'PRODUCT_PURCHASED',
        happenedAt: '2026-07-10T09:00:00.000Z',
        productId: 'burn',
        amount: 300,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 500,
  },
  {
    name: 'BALANCE_TOPUP single exact ignores a different amount',
    triggerKind: 'BALANCE_TOPUP',
    progressTarget: 1,
    progressUnit: 'topup',
    conditions: {
      metric: {
        aggregation: 'exists',
        eventTypes: ['BALANCE_TOPUP'],
        exactSpendAmount: 500,
        target: 1,
      },
    },
    events: [
      {
        id: 'topup-exact-noise',
        liveType: 'BALANCE_TOPUP',
        ledgerType: 'BALANCE_TOPUP',
        happenedAt: '2026-07-10T08:00:00.000Z',
        amount: 501,
      },
      {
        id: 'topup-exact-valid',
        liveType: 'BALANCE_TOPUP',
        ledgerType: 'BALANCE_TOPUP',
        happenedAt: '2026-07-10T09:00:00.000Z',
        amount: 500,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 1,
  },
  {
    name: 'BALANCE_TOPUP single exact blocks a different amount',
    triggerKind: 'BALANCE_TOPUP',
    progressTarget: 1,
    progressUnit: 'topup',
    conditions: {
      metric: {
        aggregation: 'exists',
        eventTypes: ['BALANCE_TOPUP'],
        exactSpendAmount: 500,
        target: 1,
      },
    },
    events: [
      {
        id: 'topup-exact-wrong',
        liveType: 'BALANCE_TOPUP',
        ledgerType: 'BALANCE_TOPUP',
        happenedAt: '2026-07-10T09:00:00.000Z',
        amount: 501,
      },
    ],
    expectedCompleted: false,
    expectedCurrent: 0,
  },
  {
    name: 'BALANCE_TOPUP single at-least accepts the threshold',
    triggerKind: 'BALANCE_TOPUP',
    progressTarget: 1,
    progressUnit: 'topup',
    conditions: {
      metric: {
        aggregation: 'exists',
        eventTypes: ['BALANCE_TOPUP'],
        minSpendAmount: 500,
        target: 1,
      },
    },
    events: [
      {
        id: 'topup-at-least-small',
        liveType: 'BALANCE_TOPUP',
        ledgerType: 'BALANCE_TOPUP',
        happenedAt: '2026-07-10T08:00:00.000Z',
        amount: 499,
      },
      {
        id: 'topup-at-least-valid',
        liveType: 'BALANCE_TOPUP',
        ledgerType: 'BALANCE_TOPUP',
        happenedAt: '2026-07-10T09:00:00.000Z',
        amount: 500,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 1,
  },
  {
    name: 'BALANCE_TOPUP count applies at-least amount to every operation',
    triggerKind: 'BALANCE_TOPUP',
    progressTarget: 2,
    progressUnit: 'topup',
    conditions: {
      metric: {
        aggregation: 'count',
        eventTypes: ['BALANCE_TOPUP'],
        minSpendAmount: 500,
        target: 2,
      },
    },
    events: [
      {
        id: 'topup-small',
        liveType: 'BALANCE_TOPUP',
        ledgerType: 'BALANCE_TOPUP',
        happenedAt: '2026-07-10T07:00:00.000Z',
        amount: 499,
      },
      {
        id: 'topup-minimum',
        liveType: 'BALANCE_TOPUP',
        ledgerType: 'BALANCE_TOPUP',
        happenedAt: '2026-07-10T08:00:00.000Z',
        amount: 500,
      },
      {
        id: 'topup-more',
        liveType: 'BALANCE_TOPUP',
        ledgerType: 'BALANCE_TOPUP',
        happenedAt: '2026-07-10T09:00:00.000Z',
        amount: 700,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 2,
  },
  {
    name: 'BALANCE_TOPUP period total accumulates operations',
    triggerKind: 'BALANCE_TOPUP',
    progressTarget: 1000,
    progressUnit: 'rub',
    conditions: {
      metric: {
        aggregation: 'sum',
        eventTypes: ['BALANCE_TOPUP'],
        target: 1000,
      },
    },
    events: [
      {
        id: 'topup-total-400',
        liveType: 'BALANCE_TOPUP',
        ledgerType: 'BALANCE_TOPUP',
        happenedAt: '2026-07-10T08:00:00.000Z',
        amount: 400,
      },
      {
        id: 'topup-total-600',
        liveType: 'BALANCE_TOPUP',
        ledgerType: 'BALANCE_TOPUP',
        happenedAt: '2026-07-10T09:00:00.000Z',
        amount: 600,
      },
    ],
    expectedCompleted: true,
    expectedCurrent: 1000,
  },
];

describe('LIVE and activity-ledger evaluator parity', () => {
  it.each(scenarios)('$name', (scenario) => {
    const events = scenario.events.map(liveEvent);
    const currentEvent = events[events.length - 1] ?? null;
    const live = evaluateGuestGameProgress(
      liveRule(scenario),
      currentEvent,
      events.slice(0, -1),
    );
    const ledger = evaluateGuestGameLedgerRule(
      ledgerRule(scenario),
      scenario.events.map(ledgerFact),
      STORE_ID,
      new Date(
        scenario.evaluatedAt ??
          scenario.events[scenario.events.length - 1]?.happenedAt ??
          '2026-07-18T00:00:00.000Z',
      ),
    );

    expect(live.current).toBe(scenario.expectedCurrent);
    expect(live.completed).toBe(scenario.expectedCompleted);
    expect(ledger.status === 'MATCHED').toBe(scenario.expectedCompleted);
    if (ledger.progress) {
      expect(ledger.progress.current).toBe(live.current);
      expect(ledger.progress.target).toBe(live.target);
    } else {
      expect(live.current).toBe(0);
    }
  });
});

describe('ledger readiness gaps that must not be promoted to fallback', () => {
  it('does not treat a generic Langame visit as opening the game module', () => {
    expect(relevantGuestGameFacts('APP_OPEN', null)).toEqual(['APP_OPENED']);
    expect(relevantGuestGameFacts('APP_OPEN', null)).not.toContain('VISIT');
  });

  it('does not treat a session start as an explicit guest check-in', () => {
    expect(relevantGuestGameFacts('CHECK_IN', null)).toEqual([
      'CHECK_IN_PERFORMED',
    ]);
    expect(relevantGuestGameFacts('CHECK_IN', null)).not.toContain(
      'SESSION_STARTED',
    );
  });

  it.todo(
    'APP_OPEN can be promoted only after the first-party portal event is written into the ledger',
  );
  it.todo(
    'CHECK_IN can be promoted only after the canonical check-in event is written into the ledger',
  );
});

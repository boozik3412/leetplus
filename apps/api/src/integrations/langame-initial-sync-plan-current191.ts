import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

export const LANGAME_INITIAL_SYNC_PLAN_CURRENT191_CONTRACT =
  'LANGAME_INITIAL_SYNC_PLAN_CURRENT191_V1' as const;

const CURRENT188_CONTRACT = 'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1';
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const EXTERNAL_ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const LANGAME_DOMAIN_SUFFIXES = ['.langame.ru', '.langamepro.ru'] as const;
const MAX_ROWS = 50_000;
const MAX_NAME_BYTES = 1_024;
const MAX_QUANTITY = 2_147_483_647;
const MAX_CANONICAL_PLAN_BYTES = 16 * 1024 * 1024;
const current191PlanBrands = new WeakSet<object>();

export type LangameInitialSyncPlanCurrent191Input = Readonly<{
  current188ContractVersion: string;
  approvalDigest: string;
  preflightReadSetDigest: string;
  tenantId: string;
  storeId: string;
  sourceId: string;
  domain: string;
  externalClubId: string;
  readSet: Readonly<{
    selectedClubs: number;
    products: number;
    inventoryItems: number;
  }>;
  products: unknown;
  inventory: unknown;
}>;

export type LangameInitialSyncPlanCurrent191 = Readonly<{
  contractVersion: typeof LANGAME_INITIAL_SYNC_PLAN_CURRENT191_CONTRACT;
  status: 'PLANNED';
  target: Readonly<{
    tenantId: string;
    storeId: string;
    sourceId: string;
    domain: string;
    externalClubId: string;
  }>;
  authorization: Readonly<{
    approvalDigest: string;
    preflightReadSetDigest: string;
  }>;
  products: readonly Readonly<{
    externalProductId: string;
    article: string;
    name: string;
    isActive: boolean;
  }>[];
  inventory: readonly Readonly<{
    externalProductId: string;
    quantity: number;
  }>[];
  planDigest: string;
  providerWritesStarted: false;
  platformWritesStarted: false;
  productionImportAllowed: false;
}>;

export function createLangameInitialSyncPlanCurrent191(
  input: LangameInitialSyncPlanCurrent191Input,
): LangameInitialSyncPlanCurrent191 {
  if (
    !hasExactKeys(input, [
      'approvalDigest',
      'current188ContractVersion',
      'domain',
      'externalClubId',
      'inventory',
      'preflightReadSetDigest',
      'products',
      'readSet',
      'sourceId',
      'storeId',
      'tenantId',
    ])
  ) {
    invalid('Invalid initial sync plan input');
  }
  if (input.current188ContractVersion !== CURRENT188_CONTRACT) {
    invalid('Invalid initial sync preflight contract');
  }
  const approvalDigest = requiredDigest(input.approvalDigest);
  const preflightReadSetDigest = requiredDigest(input.preflightReadSetDigest);
  const tenantId = requiredIdentifier(input.tenantId, 'tenant');
  const storeId = requiredIdentifier(input.storeId, 'store');
  const sourceId = requiredIdentifier(input.sourceId, 'source');
  const domain = requiredDomain(input.domain);
  const externalClubId = requiredExternalId(input.externalClubId);
  const expected = parseReadSet(input.readSet);
  const productRows = strictRows(input.products, ['active', 'id', 'name']);
  const inventoryRows = strictRows(input.inventory, ['count', 'id', 'name']);
  if (
    productRows.length !== expected.products ||
    inventoryRows.length !== expected.inventoryItems
  ) {
    unavailable('Initial sync provider read set changed after approval');
  }

  const products = productRows.map((row) => {
    const externalProductId = requiredExternalId(row.id);
    return Object.freeze({
      externalProductId,
      article: `LG-${domain}-${externalProductId}`,
      name: requiredName(row.name),
      isActive: requiredActive(row.active),
    });
  });
  assertUnique(
    products.map((product) => product.externalProductId),
    'product',
  );
  products.sort((left, right) =>
    compareExternalIds(left.externalProductId, right.externalProductId),
  );

  const productIds = new Set(
    products.map((product) => product.externalProductId),
  );
  const inventory = inventoryRows.map((row) => {
    const externalProductId = requiredExternalId(row.id);
    if (!productIds.has(externalProductId)) {
      unavailable('Initial sync inventory is outside the product read set');
    }
    requiredName(row.name);
    return Object.freeze({
      externalProductId,
      quantity: requiredQuantity(row.count),
    });
  });
  assertUnique(
    inventory.map((item) => item.externalProductId),
    'inventory',
  );
  inventory.sort((left, right) =>
    compareExternalIds(left.externalProductId, right.externalProductId),
  );

  const target = Object.freeze({
    tenantId,
    storeId,
    sourceId,
    domain,
    externalClubId,
  });
  const authorization = Object.freeze({
    approvalDigest,
    preflightReadSetDigest,
  });
  const frozenProducts = Object.freeze(products);
  const frozenInventory = Object.freeze(inventory);
  const planDigest = sha256(
    JSON.stringify([
      LANGAME_INITIAL_SYNC_PLAN_CURRENT191_CONTRACT,
      target,
      authorization,
      frozenProducts,
      frozenInventory,
    ]),
  );

  const plan = Object.freeze({
    contractVersion: LANGAME_INITIAL_SYNC_PLAN_CURRENT191_CONTRACT,
    status: 'PLANNED' as const,
    target,
    authorization,
    products: frozenProducts,
    inventory: frozenInventory,
    planDigest,
    providerWritesStarted: false as const,
    platformWritesStarted: false as const,
    productionImportAllowed: false as const,
  });
  current191PlanBrands.add(plan);
  return plan;
}

/**
 * Produces the exact UTF-8 bytes whose SHA-256 is `planDigest`. The process-
 * local brand prevents a caller from forging a structurally similar plan and
 * presenting it to the future CURRENT192 database execution boundary.
 */
export function serializeLangameInitialSyncPlanCurrent191(
  plan: LangameInitialSyncPlanCurrent191,
) {
  if (!current191PlanBrands.has(plan)) {
    unavailable('Untrusted initial sync plan');
  }
  const canonicalPlan = JSON.stringify([
    LANGAME_INITIAL_SYNC_PLAN_CURRENT191_CONTRACT,
    plan.target,
    plan.authorization,
    plan.products,
    plan.inventory,
  ]);
  if (
    Buffer.byteLength(canonicalPlan, 'utf8') > MAX_CANONICAL_PLAN_BYTES ||
    sha256(canonicalPlan) !== plan.planDigest
  ) {
    unavailable('Invalid initial sync plan provenance');
  }
  return canonicalPlan;
}

function parseReadSet(value: unknown) {
  if (!hasExactKeys(value, ['inventoryItems', 'products', 'selectedClubs'])) {
    invalid('Invalid initial sync read set');
  }
  if (
    value.selectedClubs !== 1 ||
    !boundedCount(value.products) ||
    !boundedCount(value.inventoryItems)
  ) {
    invalid('Invalid initial sync read set');
  }
  return {
    products: value.products,
    inventoryItems: value.inventoryItems,
  };
}

function strictRows(value: unknown, keys: readonly string[]) {
  if (!Array.isArray(value) || value.length > MAX_ROWS) {
    unavailable('Invalid initial sync provider rows');
  }
  if (value.some((row) => !hasExactKeys(row, keys))) {
    unavailable('Invalid initial sync provider rows');
  }
  return value as Record<string, unknown>[];
}

function hasExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (
    !isPlainRecord(value) ||
    Reflect.ownKeys(value).some((key) => typeof key !== 'string')
  ) {
    return false;
  }
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!('value' in descriptor)) return false;
  }
  return (
    Object.keys(value).sort().join('|') === [...expectedKeys].sort().join('|')
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function requiredDigest(value: unknown) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    invalid('Invalid initial sync digest');
  }
  return value;
}

function requiredIdentifier(value: unknown, label: string) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    invalid(`Invalid initial sync ${label}`);
  }
  return value;
}

function requiredDomain(value: unknown) {
  if (
    typeof value !== 'string' ||
    value !== value.toLowerCase() ||
    value.length > 253 ||
    !/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(value) ||
    value.includes('..') ||
    !LANGAME_DOMAIN_SUFFIXES.some(
      (suffix) => value === suffix.slice(1) || value.endsWith(suffix),
    )
  ) {
    invalid('Invalid initial sync domain');
  }
  return value;
}

function requiredExternalId(value: unknown) {
  const normalized =
    typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === 'string'
        ? value
        : '';
  if (!EXTERNAL_ID_PATTERN.test(normalized)) {
    unavailable('Invalid initial sync external identifier');
  }
  return normalized;
}

function requiredName(value: unknown) {
  if (typeof value !== 'string' || value !== value.trim() || !value) {
    unavailable('Invalid initial sync product name');
  }
  if (
    /\p{Cc}/u.test(value) ||
    new TextEncoder().encode(value).byteLength > MAX_NAME_BYTES
  ) {
    unavailable('Invalid initial sync product name');
  }
  return value;
}

function requiredActive(value: unknown) {
  if (value === 1 || value === true || value === '1') return true;
  if (value === 0 || value === false || value === '0') return false;
  unavailable('Invalid initial sync product state');
}

function requiredQuantity(value: unknown) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) > MAX_QUANTITY
  ) {
    unavailable('Invalid initial sync inventory quantity');
  }
  return Number(value);
}

function boundedCount(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= 0 &&
    Number(value) <= MAX_ROWS
  );
}

function assertUnique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) {
    unavailable(`Duplicate initial sync ${label} identifier`);
  }
}

function compareExternalIds(left: string, right: string) {
  return BigInt(left) < BigInt(right)
    ? -1
    : BigInt(left) > BigInt(right)
      ? 1
      : 0;
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function invalid(message: string): never {
  throw new BadRequestException(message);
}

function unavailable(message: string): never {
  throw new ServiceUnavailableException(message);
}

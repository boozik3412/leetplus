import {
  createLangameInitialSyncPlanCurrent191,
  LANGAME_INITIAL_SYNC_PLAN_CURRENT191_CONTRACT,
  serializeLangameInitialSyncPlanCurrent191,
  type LangameInitialSyncPlanCurrent191Input,
} from './langame-initial-sync-plan-current191';

const input: LangameInitialSyncPlanCurrent191Input = {
  current188ContractVersion: 'LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1',
  approvalDigest: 'a'.repeat(64),
  preflightReadSetDigest: 'b'.repeat(64),
  tenantId: 'tenant-a',
  storeId: 'store-a',
  sourceId: 'source-a',
  domain: '443.langame.ru',
  externalClubId: '42',
  readSet: { selectedClubs: 1, products: 2, inventoryItems: 1 },
  products: [
    { id: 11, name: 'Snack', active: 0 },
    { id: 10, name: 'Water', active: 1 },
  ],
  inventory: [{ id: 10, name: 'Water', count: 5 }],
};

describe('createLangameInitialSyncPlanCurrent191', () => {
  it('builds a deterministic selected-Store plan without starting effects', () => {
    const first = createLangameInitialSyncPlanCurrent191(input);
    const second = createLangameInitialSyncPlanCurrent191({
      ...input,
      products: [...(input.products as unknown[])].reverse(),
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      contractVersion: LANGAME_INITIAL_SYNC_PLAN_CURRENT191_CONTRACT,
      status: 'PLANNED',
      target: {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        sourceId: 'source-a',
        domain: '443.langame.ru',
        externalClubId: '42',
      },
      products: [
        {
          externalProductId: '10',
          article: 'LG-443.langame.ru-10',
          name: 'Water',
          isActive: true,
        },
        {
          externalProductId: '11',
          article: 'LG-443.langame.ru-11',
          name: 'Snack',
          isActive: false,
        },
      ],
      inventory: [{ externalProductId: '10', quantity: 5 }],
      providerWritesStarted: false,
      platformWritesStarted: false,
      productionImportAllowed: false,
    });
    expect(first.planDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns a deeply frozen plan and does not mutate provider rows', () => {
    const original = structuredClone(input);
    const plan = createLangameInitialSyncPlanCurrent191(input);

    expect(input).toEqual(original);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.target)).toBe(true);
    expect(Object.isFrozen(plan.authorization)).toBe(true);
    expect(Object.isFrozen(plan.products)).toBe(true);
    expect(Object.isFrozen(plan.products[0])).toBe(true);
    expect(Object.isFrozen(plan.inventory)).toBe(true);
    expect(Object.isFrozen(plan.inventory[0])).toBe(true);
  });

  it('serializes only a branded plan to the exact digest-bound canonical bytes', () => {
    const plan = createLangameInitialSyncPlanCurrent191(input);
    const canonicalPlan = serializeLangameInitialSyncPlanCurrent191(plan);

    expect(JSON.parse(canonicalPlan)).toEqual([
      LANGAME_INITIAL_SYNC_PLAN_CURRENT191_CONTRACT,
      plan.target,
      plan.authorization,
      plan.products,
      plan.inventory,
    ]);
    expect(serializeLangameInitialSyncPlanCurrent191(plan)).toBe(canonicalPlan);
    expect(() =>
      serializeLangameInitialSyncPlanCurrent191(structuredClone(plan)),
    ).toThrow('Untrusted initial sync plan');
  });

  it('rejects a provider count changed after preflight approval', () => {
    expect(() =>
      createLangameInitialSyncPlanCurrent191({
        ...input,
        readSet: { selectedClubs: 1, products: 1, inventoryItems: 1 },
      }),
    ).toThrow('Initial sync provider read set changed after approval');
  });

  it('rejects an over-broad planner input envelope', () => {
    expect(() =>
      createLangameInitialSyncPlanCurrent191({
        ...input,
        unexpectedAuthority: true,
      } as LangameInitialSyncPlanCurrent191Input),
    ).toThrow('Invalid initial sync plan input');
  });

  it('rejects duplicate product and inventory identifiers', () => {
    expect(() =>
      createLangameInitialSyncPlanCurrent191({
        ...input,
        readSet: { selectedClubs: 1, products: 2, inventoryItems: 0 },
        products: [
          { id: 10, name: 'Water', active: 1 },
          { id: '10', name: 'Water', active: 1 },
        ],
        inventory: [],
      }),
    ).toThrow('Duplicate initial sync product identifier');
  });

  it('rejects inventory outside the exact product read set', () => {
    expect(() =>
      createLangameInitialSyncPlanCurrent191({
        ...input,
        inventory: [{ id: 12, name: 'Unknown', count: 1 }],
      }),
    ).toThrow('Initial sync inventory is outside the product read set');
  });

  it.each([
    [{ id: 0, name: 'Water', active: 1 }],
    [{ id: 10, name: ' Water', active: 1 }],
    [{ id: 10, name: 'Bad\nName', active: 1 }],
    [{ id: 10, name: 'Water', active: 2 }],
    [{ id: 10, name: 'Water', active: 1, extra: true }],
  ])('rejects malformed product rows %#', (products) => {
    expect(() =>
      createLangameInitialSyncPlanCurrent191({
        ...input,
        readSet: { selectedClubs: 1, products: 1, inventoryItems: 0 },
        products,
        inventory: [],
      }),
    ).toThrow();
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER])(
    'rejects malformed inventory quantity %p',
    (count) => {
      expect(() =>
        createLangameInitialSyncPlanCurrent191({
          ...input,
          inventory: [{ id: 10, name: 'Water', count }],
        }),
      ).toThrow('Invalid initial sync inventory quantity');
    },
  );

  it('rejects a non-Langame or noncanonical target domain', () => {
    expect(() =>
      createLangameInitialSyncPlanCurrent191({
        ...input,
        domain: 'HTTPS://evil.example',
      }),
    ).toThrow('Invalid initial sync domain');
  });

  it('rejects accessor-bearing provider records without invoking the getter', () => {
    const getter = jest.fn(() => 10);
    const row = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(row, {
      id: { enumerable: true, get: getter },
      name: { enumerable: true, value: 'Water' },
      active: { enumerable: true, value: 1 },
    });

    expect(() =>
      createLangameInitialSyncPlanCurrent191({
        ...input,
        readSet: { selectedClubs: 1, products: 1, inventoryItems: 0 },
        products: [row],
        inventory: [],
      }),
    ).toThrow('Invalid initial sync provider rows');
    expect(getter).not.toHaveBeenCalled();
  });
});

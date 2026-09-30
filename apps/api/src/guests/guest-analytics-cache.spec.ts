import { GuestAnalyticsCache } from './guest-analytics-cache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function flush() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

describe('GuestAnalyticsCache', () => {
  let time = 1_000;
  const now = () => time;

  function createCache(
    overrides: Partial<
      ConstructorParameters<typeof GuestAnalyticsCache>[0]
    > = {},
  ) {
    return new GuestAnalyticsCache<string>({
      freshMs: 100,
      staleMs: 1_000,
      maxEntries: 2,
      now,
      ...overrides,
    });
  }

  beforeEach(() => {
    time = 1_000;
  });

  it('computes once and serves fresh values without recomputing', async () => {
    const cache = createCache();
    const compute = jest.fn().mockResolvedValue('v1');

    const first = await cache.get('k', 't1', compute);
    time += 50;
    const second = await cache.get('k', 't1', compute);

    expect(first).toEqual({
      value: 'v1',
      computedAt: 1_000,
      source: 'computed',
    });
    expect(second).toEqual({ value: 'v1', computedAt: 1_000, source: 'fresh' });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('shares one computation between concurrent callers', async () => {
    const cache = createCache();
    const gate = deferred<string>();
    const compute = jest.fn().mockReturnValue(gate.promise);

    const callers = [
      cache.get('k', 't1', compute),
      cache.get('k', 't1', compute),
      cache.get('k', 't1', compute),
    ];
    await flush();
    gate.resolve('shared');

    const results = await Promise.all(callers);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.value)).toEqual([
      'shared',
      'shared',
      'shared',
    ]);
  });

  it('serves a stale value immediately and refreshes it in the background', async () => {
    const cache = createCache();
    const compute = jest
      .fn()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new');

    await cache.get('k', 't1', compute);
    time += 500;
    const stale = await cache.get('k', 't1', compute);
    await flush();
    const refreshed = await cache.get('k', 't1', compute);

    expect(stale).toEqual({ value: 'old', computedAt: 1_000, source: 'stale' });
    expect(refreshed.value).toBe('new');
    expect(refreshed.source).toBe('fresh');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('starts only one background refresh for many stale readers', async () => {
    const cache = createCache();
    const gate = deferred<string>();
    const compute = jest
      .fn()
      .mockResolvedValueOnce('old')
      .mockReturnValueOnce(gate.promise);

    await cache.get('k', 't1', compute);
    time += 500;
    await Promise.all([
      cache.get('k', 't1', compute),
      cache.get('k', 't1', compute),
      cache.get('k', 't1', compute),
    ]);

    expect(compute).toHaveBeenCalledTimes(2);
    gate.resolve('new');
    await flush();
    expect(cache.inflightCount).toBe(0);
  });

  it('keeps the stale value when a background refresh fails and reports the error', async () => {
    const onBackgroundError = jest.fn();
    const cache = createCache({ onBackgroundError });
    const compute = jest
      .fn()
      .mockResolvedValueOnce('old')
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce('recovered');

    await cache.get('k', 't1', compute);
    time += 500;
    await cache.get('k', 't1', compute);
    await flush();
    const afterFailure = await cache.get('k', 't1', compute);
    await flush();
    const afterRecovery = await cache.get('k', 't1', compute);

    expect(onBackgroundError).toHaveBeenCalledWith(expect.any(Error), 'k');
    expect(afterFailure.value).toBe('old');
    expect(afterRecovery.value).toBe('recovered');
  });

  it('blocks and recomputes once the value is older than the stale window', async () => {
    const cache = createCache();
    const compute = jest
      .fn()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new');

    await cache.get('k', 't1', compute);
    time += 5_000;
    const result = await cache.get('k', 't1', compute);

    expect(result).toEqual({
      value: 'new',
      computedAt: 6_000,
      source: 'computed',
    });
  });

  it('propagates computation errors to every waiting caller and does not cache them', async () => {
    const cache = createCache();
    const gate = deferred<string>();
    const compute = jest
      .fn()
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValueOnce('ok');

    const callers = [
      cache.get('k', 't1', compute),
      cache.get('k', 't1', compute),
    ];
    await flush();
    gate.reject(new Error('boom'));

    await expect(callers[0]).rejects.toThrow('boom');
    await expect(callers[1]).rejects.toThrow('boom');
    expect(cache.size).toBe(0);
    await expect(cache.get('k', 't1', compute)).resolves.toMatchObject({
      value: 'ok',
    });
  });

  it('invalidates a tenant without touching other tenants', async () => {
    const cache = createCache({ maxEntries: 5 });
    const computeA = jest
      .fn()
      .mockResolvedValueOnce('a1')
      .mockResolvedValueOnce('a2');
    const computeB = jest.fn().mockResolvedValue('b1');

    await cache.get('a', 't1', computeA);
    await cache.get('b', 't2', computeB);
    cache.invalidateTenant('t1');

    expect((await cache.get('a', 't1', computeA)).value).toBe('a2');
    expect((await cache.get('b', 't2', computeB)).source).toBe('fresh');
    expect(computeB).toHaveBeenCalledTimes(1);
  });

  it('does not store a computation that started before an invalidation', async () => {
    const cache = createCache();
    const gate = deferred<string>();
    const compute = jest
      .fn()
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValueOnce('after-write');

    const early = cache.get('k', 't1', compute);
    await flush();
    cache.invalidateTenant('t1');
    gate.resolve('before-write');
    await early;

    expect(cache.size).toBe(0);
    expect((await cache.get('k', 't1', compute)).value).toBe('after-write');
  });

  it('evicts the least recently used entry beyond maxEntries', async () => {
    const cache = createCache({ maxEntries: 2 });
    const compute = (value: string) => jest.fn().mockResolvedValue(value);
    const a = compute('a');
    const b = compute('b');
    const c = compute('c');

    await cache.get('a', 't1', a);
    time += 1;
    await cache.get('b', 't1', b);
    time += 1;
    await cache.get('a', 't1', a);
    time += 1;
    await cache.get('c', 't1', c);

    expect(cache.size).toBe(2);
    expect((await cache.get('a', 't1', a)).source).toBe('fresh');
    expect((await cache.get('c', 't1', c)).source).toBe('fresh');
    expect((await cache.get('b', 't1', b)).source).toBe('computed');
  });

  it('runs uncached computations under the same concurrency limit', async () => {
    const cache = createCache({ maxConcurrentComputations: 1 });
    const gate = deferred<string>();
    const order: string[] = [];

    const first = cache.runUncached(() => {
      order.push('first');
      return gate.promise;
    });
    const second = cache.runUncached(() => {
      order.push('second');
      return Promise.resolve('two');
    });
    await flush();
    expect(order).toEqual(['first']);

    gate.resolve('one');
    await expect(first).resolves.toBe('one');
    await expect(second).resolves.toBe('two');
    expect(order).toEqual(['first', 'second']);
    expect(cache.size).toBe(0);
  });

  it('limits concurrent computations and runs the queue in order', async () => {
    const cache = createCache({ maxEntries: 10, maxConcurrentComputations: 1 });
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    const started: number[] = [];
    const computeFor = (index: number) => () => {
      started.push(index);
      return gates[index].promise;
    };

    const calls = [
      cache.get('k0', 't1', computeFor(0)),
      cache.get('k1', 't1', computeFor(1)),
      cache.get('k2', 't1', computeFor(2)),
    ];
    await flush();
    expect(started).toEqual([0]);

    gates[0].resolve('v0');
    await flush();
    expect(started).toEqual([0, 1]);

    gates[1].resolve('v1');
    await flush();
    expect(started).toEqual([0, 1, 2]);

    gates[2].resolve('v2');
    const results = await Promise.all(calls);
    expect(results.map((result) => result.value)).toEqual(['v0', 'v1', 'v2']);
  });
});

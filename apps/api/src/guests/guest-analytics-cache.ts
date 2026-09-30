/**
 * In-process cache for expensive per-tenant guest analytics.
 *
 * - single-flight: concurrent callers of the same key share one computation;
 * - stale-while-revalidate: a value older than `freshMs` but younger than
 *   `staleMs` is returned immediately and refreshed in the background;
 * - per-tenant generations: `invalidateTenant` makes every older entry (and
 *   every computation that started before the call) unusable;
 * - bounded memory: at most `maxEntries` values, least recently used first out;
 * - bounded CPU: at most `maxConcurrentComputations` computations run at once,
 *   the rest wait in FIFO order.
 *
 * The API runs as one Node process per slot, so an in-process cache is enough;
 * a stale value is never older than `staleMs` and CRM writes invalidate it.
 */

export type GuestAnalyticsCacheOptions = {
  freshMs: number;
  staleMs: number;
  maxEntries: number;
  maxConcurrentComputations?: number;
  now?: () => number;
  onBackgroundError?: (error: unknown, key: string) => void;
};

type Entry<T> = {
  value: T;
  tenantId: string;
  computedAt: number;
  lastAccessAt: number;
  generation: number;
};

type Inflight<T> = {
  promise: Promise<T>;
  generation: number;
};

export class GuestAnalyticsCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inflight = new Map<string, Inflight<T>>();
  private readonly generations = new Map<string, number>();
  private readonly waiting: Array<() => void> = [];
  private running = 0;
  private readonly now: () => number;
  private readonly maxConcurrent: number;

  constructor(private readonly options: GuestAnalyticsCacheOptions) {
    this.now = options.now ?? Date.now;
    this.maxConcurrent = Math.max(options.maxConcurrentComputations ?? 1, 1);
  }

  get size() {
    return this.entries.size;
  }

  get inflightCount() {
    return this.inflight.size;
  }

  async get(
    key: string,
    tenantId: string,
    compute: () => Promise<T>,
  ): Promise<{
    value: T;
    computedAt: number;
    source: 'fresh' | 'stale' | 'computed';
  }> {
    const generation = this.generationOf(tenantId);
    const entry = this.entries.get(key);
    const currentTime = this.now();

    if (entry && entry.generation === generation) {
      const age = currentTime - entry.computedAt;

      if (age <= this.options.freshMs) {
        entry.lastAccessAt = currentTime;
        return {
          value: entry.value,
          computedAt: entry.computedAt,
          source: 'fresh',
        };
      }

      if (age <= this.options.staleMs) {
        entry.lastAccessAt = currentTime;
        this.refreshInBackground(key, tenantId, compute);
        return {
          value: entry.value,
          computedAt: entry.computedAt,
          source: 'stale',
        };
      }
    }

    const running = this.inflight.get(key);

    if (running && running.generation === generation) {
      const value = await running.promise;
      return { value, computedAt: this.now(), source: 'computed' };
    }

    const value = await this.start(key, tenantId, compute, generation);
    return { value, computedAt: this.now(), source: 'computed' };
  }

  invalidateTenant(tenantId: string) {
    this.generations.set(tenantId, this.generationOf(tenantId) + 1);

    for (const [key, entry] of this.entries) {
      if (entry.tenantId === tenantId) {
        this.entries.delete(key);
      }
    }
  }

  clear() {
    this.entries.clear();
    this.inflight.clear();
  }

  private generationOf(tenantId: string) {
    return this.generations.get(tenantId) ?? 0;
  }

  private refreshInBackground(
    key: string,
    tenantId: string,
    compute: () => Promise<T>,
  ) {
    const generation = this.generationOf(tenantId);
    const running = this.inflight.get(key);

    if (running && running.generation === generation) {
      return;
    }

    void this.start(key, tenantId, compute, generation).catch((error) => {
      this.options.onBackgroundError?.(error, key);
    });
  }

  private start(
    key: string,
    tenantId: string,
    compute: () => Promise<T>,
    generation: number,
  ) {
    const promise = this.runGated(compute).then(
      (value) => {
        this.finish(key, generation);

        if (this.generationOf(tenantId) === generation) {
          this.store(key, tenantId, value, generation);
        }

        return value;
      },
      (error: unknown) => {
        this.finish(key, generation);
        throw error;
      },
    );

    this.inflight.set(key, { promise, generation });

    return promise;
  }

  private finish(key: string, generation: number) {
    const running = this.inflight.get(key);

    if (running && running.generation === generation) {
      this.inflight.delete(key);
    }
  }

  private store(key: string, tenantId: string, value: T, generation: number) {
    const time = this.now();
    this.entries.set(key, {
      value,
      tenantId,
      computedAt: time,
      lastAccessAt: time,
      generation,
    });

    while (this.entries.size > this.options.maxEntries) {
      let oldestKey: string | null = null;
      let oldestAccess = Number.POSITIVE_INFINITY;

      for (const [candidateKey, candidate] of this.entries) {
        if (candidateKey !== key && candidate.lastAccessAt < oldestAccess) {
          oldestKey = candidateKey;
          oldestAccess = candidate.lastAccessAt;
        }
      }

      if (oldestKey === null) {
        break;
      }

      this.entries.delete(oldestKey);
    }
  }

  /** Runs a computation under the same concurrency limit without caching it. */
  runUncached<R>(compute: () => Promise<R>): Promise<R> {
    return this.runGated(compute);
  }

  private async runGated<R>(compute: () => Promise<R>): Promise<R> {
    if (this.running < this.maxConcurrent) {
      this.running += 1;
    } else {
      // The releasing computation hands its slot over, so `running` stays exact.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    try {
      return await compute();
    } finally {
      const next = this.waiting.shift();

      if (next) {
        next();
      } else {
        this.running -= 1;
      }
    }
  }
}

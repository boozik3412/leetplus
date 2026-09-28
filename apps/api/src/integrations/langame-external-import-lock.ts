import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Client } from 'pg';
import { EZ_GAME_LANGAME_SCOPE } from './langame-external-pilot-authority';

type HeldLock = {
  key: string;
  alive: boolean;
  verify: () => Promise<void>;
};

const ownership = new AsyncLocalStorage<HeldLock>();

function scopeKey() {
  return [
    'LEETPLUS_LANGAME_EXTERNAL_IMPORT_V1',
    EZ_GAME_LANGAME_SCOPE.tenantId,
    EZ_GAME_LANGAME_SCOPE.sourceId,
    EZ_GAME_LANGAME_SCOPE.storeId,
  ].join(':');
}

function advisoryKeys(key: string) {
  const hash = createHash('sha256').update(key).digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

function databaseConnection() {
  const raw = process.env.DATABASE_URL;
  if (!raw)
    throw new ServiceUnavailableException(
      'External import DB identity is missing',
    );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ServiceUnavailableException(
      'External import DB identity is invalid',
    );
  }
  const test =
    process.env.NODE_ENV === 'test' &&
    ['127.0.0.1', 'localhost'].includes(url.hostname) &&
    url.pathname === '/leetplus_ci';
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    (!test &&
      (url.hostname !== 'postgres' ||
        url.pathname !== '/leetplus' ||
        decodeURIComponent(url.username) !== 'leetplus_runtime' ||
        url.searchParams.get('sslmode') !== 'require' ||
        url.searchParams.get('sslaccept') !== 'strict' ||
        url.searchParams.get('sslcert') !== '/run/secrets/db-ca.pem'))
  ) {
    throw new ServiceUnavailableException(
      'External import DB boundary is not admitted',
    );
  }
  let ssl:
    | false
    | { ca: Buffer; rejectUnauthorized: true; servername: string } = false;
  if (!test) {
    const certPath = '/run/secrets/db-ca.pem';
    const stat = lstatSync(certPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65_536) {
      throw new ServiceUnavailableException(
        'External import DB root is unsafe',
      );
    }
    ssl = {
      ca: readFileSync(certPath),
      rejectUnauthorized: true,
      servername: 'postgres',
    };
  }
  return {
    host: url.hostname,
    port: Number(url.port || '5432'),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    keepAlive: true,
    application_name: 'leetplus-external-langame-import-lock',
  };
}

/**
 * The same exact session lock surrounds manual business/guest imports and the
 * dedicated daily worker. A nested daily child inherits ownership through the
 * async context. No DB transaction is held while Langame responds.
 */
export async function withExactExternalImportLock<T>(
  tenantId: string,
  work: () => Promise<T>,
): Promise<T> {
  const inherited = ownership.getStore();
  if (tenantId !== EZ_GAME_LANGAME_SCOPE.tenantId) {
    if (inherited) {
      throw new ServiceUnavailableException(
        'External import cannot enter another tenant while holding its lock',
      );
    }
    return work();
  }
  const key = scopeKey();
  if (inherited) {
    if (inherited.key !== key || !inherited.alive) {
      throw new ServiceUnavailableException(
        'External import lock ownership changed',
      );
    }
    await inherited.verify();
    return work();
  }

  const client = new Client(databaseConnection());
  const held: HeldLock = {
    key,
    alive: true,
    verify: async () => {
      if (!held.alive) {
        throw new ServiceUnavailableException(
          'External import session lock was lost',
        );
      }
      const [first, second] = advisoryKeys(key);
      try {
        const proof = await client.query<{ held: boolean }>(
          `SELECT EXISTS (
            SELECT 1 FROM pg_catalog.pg_locks
            WHERE locktype='advisory' AND pid=pg_backend_pid()
              AND classid=$1::oid AND objid=$2::oid AND objsubid=2
              AND mode='ExclusiveLock' AND granted
          ) AS held`,
          [first >>> 0, second >>> 0],
        );
        if (proof.rows.length !== 1 || proof.rows[0].held !== true) {
          throw new Error('External import lock is not held');
        }
      } catch {
        held.alive = false;
        throw new ServiceUnavailableException(
          'External import session lock was lost',
        );
      }
    },
  };
  const onLoss = () => {
    held.alive = false;
  };
  client.on('error', onLoss);
  client.on('end', onLoss);
  let acquired = false;
  let outcome: { ok: true; value: T } | { ok: false; error: unknown } = {
    ok: false,
    error: new ServiceUnavailableException('External import did not start'),
  };
  let releaseError: ServiceUnavailableException | null = null;
  try {
    await client.connect();
    const [first, second] = advisoryKeys(key);
    const result = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired',
      [first, second],
    );
    acquired = result.rows.length === 1 && result.rows[0].acquired === true;
    if (!acquired) {
      throw new ServiceUnavailableException(
        'External Langame import is already active',
      );
    }
    const value = await ownership.run(held, async () => {
      const value = await work();
      await assertExactExternalImportLockHeld();
      return value;
    });
    outcome = { ok: true, value };
  } catch (error) {
    outcome = { ok: false, error };
  } finally {
    held.alive = false;
    if (acquired) {
      try {
        const [first, second] = advisoryKeys(key);
        const released = await client.query<{ released: boolean }>(
          'SELECT pg_advisory_unlock($1::integer, $2::integer) AS released',
          [first, second],
        );
        if (released.rows.length !== 1 || released.rows[0].released !== true) {
          releaseError = new ServiceUnavailableException(
            'External import lock release is ambiguous',
          );
        }
      } catch {
        // Ambiguous release is never a retry permit. The connection is closed.
        releaseError = new ServiceUnavailableException(
          'External import lock release is ambiguous',
        );
      }
    }
    await client.end().catch(() => undefined);
  }
  if (releaseError) throw releaseError;
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

export async function assertExactExternalImportLockHeld() {
  const held = ownership.getStore();
  if (!held?.alive || held.key !== scopeKey()) {
    throw new ServiceUnavailableException(
      'External import session lock was lost',
    );
  }
  await held.verify();
}

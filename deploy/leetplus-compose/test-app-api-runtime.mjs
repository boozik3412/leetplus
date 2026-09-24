import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { CONTRACT, SCHEMA, SAFE_API, canonical, imageId, release } from './contract.mjs';

const [apiImage, postgresImage, output] = process.argv.slice(2);
const SHA = /^[a-f0-9]{40}$/;

if (process.argv.length !== 5) {
  throw new Error('Usage: node test-app-api-runtime.mjs <api-image-id> <postgres-image-id> <output-json>');
}
imageId(apiImage);
imageId(postgresImage);
if (!path.isAbsolute(output) || fs.existsSync(output)) {
  throw new Error('Output must be an absent absolute path');
}

function docker(args, options = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function dockerQuiet(args) {
  try {
    execFileSync('docker', args, { stdio: 'ignore' });
  } catch {
    // Cleanup only targets names created by this invocation.
  }
}

function environmentPairs(values) {
  return Object.entries(values).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
}

function randomSecret() {
  return crypto.randomBytes(48).toString('base64url');
}

function request(container, pathname, { body, headers = {}, method = 'GET' } = {}) {
  const probe = String.raw`
const http = require('node:http');
const path = process.argv[1];
const options = JSON.parse(process.argv[2]);
const request = http.request({ host: '127.0.0.1', port: 4000, path, method: options.method, headers: options.headers, timeout: 5000 }, response => {
  let body = '';
  response.on('data', chunk => { body += chunk; if (body.length > 65536) response.destroy(); });
  response.on('end', () => process.stdout.write(JSON.stringify({ status: response.statusCode, body })));
});
request.on('timeout', () => request.destroy(new Error('timeout')));
request.on('error', error => { console.error(error.message); process.exit(1); });
if (options.body !== undefined) request.write(options.body);
request.end();`;
  const result = docker(['exec', container, 'node', '-e', probe, pathname, JSON.stringify({ body, headers, method })]);
  const response = JSON.parse(result);
  let json = null;
  try { json = JSON.parse(response.body); } catch { /* endpoint need not be JSON for a negative */ }
  return { ...response, json };
}

function waitReady(container, releaseMetadata) {
  let lastError = '';
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const response = request(container, '/health/ready');
      if (
        response.status === 200 &&
        response.json?.ok === true &&
        response.json?.release?.sha === releaseMetadata.releaseSha &&
        response.json?.dependencies?.database?.migration === SCHEMA.migration &&
        response.json?.dependencies?.database?.migrationCount === SCHEMA.migrationCount
      ) return response.json;
      lastError = JSON.stringify(response).slice(0, 2048);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error(`API readiness did not satisfy CURRENT191: ${lastError}`);
}

function inspectReleaseMetadata() {
  const value = JSON.parse(docker([
    'run', '--rm', '--network', 'none', '--entrypoint', 'node', apiImage,
    '-e', 'process.stdout.write(require("/app/release.json"))',
  ]));
  release({ ...value, images: { api: apiImage, web: postgresImage, postgres: postgresImage, redis: postgresImage } });
  if (value.contract !== CONTRACT || !SHA.test(value.releaseSha ?? '')) {
    throw new Error('API image release metadata is invalid');
  }
  return value;
}

function createRuntimeSecret(volume, databaseUrl) {
  const secret = {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: randomSecret(),
    GUEST_PORTAL_JWT_SECRET: randomSecret(),
    GUEST_GAME_REFERRAL_SECRET: randomSecret(),
    APP_ENCRYPTION_KEY: randomSecret(),
    INTEGRATION_ENCRYPTION_KEY: randomSecret(),
    IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY: randomSecret(),
    IDENTITY_MAIL_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64url'),
    SYNC_SERVICE_TOKEN: randomSecret(),
  };
  const source = `const fs=require('node:fs');const value=${JSON.stringify(secret)};fs.writeFileSync('/run/secrets/runtime.json',JSON.stringify(value));fs.chownSync('/run/secrets/runtime.json',12010,12050);fs.chmodSync('/run/secrets/runtime.json',0o640);`;
  docker([
    'run', '--rm', '--user', '0:0', '--mount', `type=volume,src=${volume},dst=/run/secrets`,
    '--entrypoint', 'node', apiImage, '-e', source,
  ]);
}

function createFixtureCertificate(volume) {
  docker([
    'run', '--rm', '--user', '0:0', '--mount', `type=volume,src=${volume},dst=/run/secrets`,
    '--entrypoint', '/usr/bin/openssl', apiImage, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=postgres', '-addext', 'subjectAltName=DNS:postgres',
    '-keyout', '/run/secrets/db-key.pem', '-out', '/run/secrets/db-ca.pem',
  ]);
  docker([
    'run', '--rm', '--user', '0:0', '--mount', `type=volume,src=${volume},dst=/run/secrets`,
    '--entrypoint', 'node', apiImage, '-e',
    "const fs=require('node:fs');fs.chownSync('/run/secrets/db-key.pem',12030,12030);fs.chmodSync('/run/secrets/db-key.pem',0o600);fs.chownSync('/run/secrets/db-ca.pem',12010,12050);fs.chmodSync('/run/secrets/db-ca.pem',0o640);",
  ]);
}

const nonce = crypto.randomBytes(10).toString('hex');
const prefix = `leetplus-app-api-runtime-${nonce}`;
const network = `${prefix}-network`;
const postgres = `${prefix}-postgres`;
const volume = `${prefix}-secret`;
const containers = [];
let temporaryRoot = null;

function cleanup() {
  for (const container of containers.reverse()) dockerQuiet(['rm', '--force', container]);
  dockerQuiet(['rm', '--force', postgres]);
  dockerQuiet(['network', 'rm', network]);
  dockerQuiet(['volume', 'rm', '--force', volume]);
  if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

try {
  const metadata = inspectReleaseMetadata();
  if (metadata.migration !== SCHEMA.migration || metadata.migrationCount !== SCHEMA.migrationCount) {
    throw new Error('API image does not pin CURRENT191');
  }
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'leetplus-app-api-runtime-'));
  docker(['network', 'create', '--internal', network]);
  docker(['volume', 'create', volume]);
  createFixtureCertificate(volume);

  // The fixture is created inside its own network and is removed in finally.
  // No production DSN, image tag, network, or persisted data path is accepted.
  docker([
    'run', '--detach', '--name', postgres, '--network', network, '--network-alias', 'postgres',
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '12030:12030',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=536870912,mode=1777', '--mount', `type=volume,src=${volume},dst=/tls,readonly`, '--entrypoint', '/bin/bash', postgresImage,
    '-ec', [
      'export PATH=/usr/lib/postgresql/16/bin:$PATH',
      'initdb -D /tmp/pg -U postgres --locale=en_US.UTF-8 -A trust >/tmp/init.log',
      'printf "hostssl all all all trust\\n" >> /tmp/pg/pg_hba.conf',
      'pg_ctl -D /tmp/pg -o "-h 0.0.0.0 -k /tmp -c ssl=on -c ssl_cert_file=/tls/db-ca.pem -c ssl_key_file=/tls/db-key.pem" -l /tmp/pg.log -w start',
      'createdb -h /tmp -U postgres leetplus',
      'psql -h /tmp -U postgres -d leetplus -v ON_ERROR_STOP=1 -c "CREATE ROLE leetplus_runtime LOGIN"',
      'touch /tmp/ready',
      'exec tail -f /dev/null',
    ].join('; '),
  ]);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (spawnSync('docker', ['exec', postgres, 'test', '-f', '/tmp/ready']).status === 0) break;
    if (attempt === 29) throw new Error(`PostgreSQL fixture did not start: ${docker(['logs', postgres])}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }

  const databaseUrl = 'postgresql://leetplus_runtime:fixture@postgres:5432/leetplus?schema=public&connection_limit=4&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict';
  const migrationUrl = 'postgresql://postgres@postgres:5432/leetplus?schema=public&connection_limit=4&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict';
  docker([
    'run', '--rm', '--network', network, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=134217728,mode=1777', '--mount', `type=volume,src=${volume},dst=/run/secrets,readonly`, '-e', `DATABASE_URL=${migrationUrl}`,
    '--entrypoint', 'node', apiImage, '/app/packages/database/scripts/canonical-prisma-deploy.mjs',
  ]);
  docker([
    'exec', postgres, '/usr/lib/postgresql/16/bin/psql', '-h', '/tmp', '-U', 'postgres', '-d', 'leetplus', '-v', 'ON_ERROR_STOP=1', '-c',
    'GRANT USAGE ON SCHEMA public TO leetplus_runtime; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO leetplus_runtime; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO leetplus_runtime;',
  ]);
  createRuntimeSecret(volume, databaseUrl);

  const reportSlots = [];
  for (const [slot, uid] of [['blue', 12010], ['green', 12011]]) {
    const container = `${prefix}-api-${slot}`;
    containers.push(container);
    const runtimeEnvironment = {
      ...SAFE_API,
      LEETPLUS_API_RUNTIME_ROLE: 'COMBINED',
      RELEASE_SHA: metadata.releaseSha,
      BUILD_TIME: metadata.builtAt,
      EXPECTED_DATABASE_MIGRATION: SCHEMA.migration,
      EXPECTED_DATABASE_MIGRATION_COUNT: String(SCHEMA.migrationCount),
    };
    docker([
      'run', '--detach', '--name', container, '--network', network,
      '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', `${uid}:${uid}`, '--group-add', '12050',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=134217728,mode=1777',
      '--mount', `type=volume,src=${volume},dst=/run/secrets,readonly`,
      ...environmentPairs(runtimeEnvironment), apiImage,
    ]);
    const readiness = waitReady(container, metadata);
    const version = request(container, '/version');
    if (version.status !== 200 || version.json?.release?.sha !== metadata.releaseSha) {
      throw new Error(`${slot} API version probe did not return its immutable image SHA`);
    }
    const publicDirectory = request(container, '/guest-portal/gamification/clubs');
    if (publicDirectory.status !== 200 || !Array.isArray(publicDirectory.json?.clubs)) {
      throw new Error(`${slot} public guest directory was not anonymously available`);
    }
    const corporateDenied = request(container, '/guests/gamification', { headers: { authorization: 'Bearer invalid-runtime-fixture-token' } });
    if (corporateDenied.status !== 401) {
      throw new Error(`${slot} tenant gamification boundary accepted an invalid corporate token`);
    }
    const workerDenied = request(container, '/guests/gamification/scheduled/deliveries/dispatch', {
      method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'x-sync-service-token': 'invalid-runtime-fixture-token' },
    });
    if (workerDenied.status !== 401) {
      throw new Error(`${slot} scheduled worker HTTP boundary accepted an invalid token`);
    }
    const inspected = JSON.parse(docker(['inspect', container]))[0];
    const command = JSON.stringify(inspected.Config.Cmd ?? []);
    const runtimeEnv = new Set(inspected.Config.Env ?? []);
    if (inspected.Image !== apiImage) {
      throw new Error(`${slot} container image identity drifted from the exact API image`);
    }
    if (!command.includes('api') || /bonus-ledger-worker|langame-daily-worker/u.test(command)) {
      throw new Error(`${slot} container did not run the API entrypoint exclusively`);
    }
    for (const [key, expected] of Object.entries(SAFE_API).filter(([key]) => key.includes('SCHEDULER') || key.includes('SCHEDULED_HTTP'))) {
      if (!runtimeEnv.has(`${key}=${expected}`)) throw new Error(`${slot} scheduler fence ${key} is not exact`);
    }
    reportSlots.push({
      slot,
      uid,
      readiness: { migration: readiness.dependencies.database.migration, migrationCount: readiness.dependencies.database.migrationCount, releaseSha: readiness.release.sha },
      probes: { version: version.status, publicGuestDirectory: publicDirectory.status, invalidCorporateToken: corporateDenied.status, invalidWorkerToken: workerDenied.status },
      apiEntrypointOnly: true,
      schedulerFencesExact: true,
    });
  }
  const report = {
    contract: 'LEETPLUS_COMPOSE_APP_API_RUNTIME_VALIDATION_V1',
    decision: 'PASS',
    releaseSha: metadata.releaseSha,
    apiImage,
    postgresImage,
    schema: { migration: SCHEMA.migration, migrationCount: SCHEMA.migrationCount },
    fixture: { disposable: true, internalNetwork: true, productionCalls: false },
    slots: reportSlots,
  };
  fs.writeFileSync(output, canonical(report), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
} finally {
  cleanup();
}

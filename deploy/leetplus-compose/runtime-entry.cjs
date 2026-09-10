'use strict';
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const commands = {
  api: ['/app/apps/api/dist/main.js'],
  web: ['/app/apps/web/node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0', '--port', '3000'],
  'bonus-ledger-worker': ['/app/apps/api/dist/guest-gamification/guest-bonus-ledger-worker.cli.js'],
  'langame-daily-worker': ['/app/apps/api/dist/integrations/langame-daily-worker.cli.js'],
};
const mode = process.argv[2];
if (!Object.hasOwn(commands, mode) || process.argv.length !== 3 || process.getuid() === 0) {
  throw new Error('Only an exact non-root runtime entrypoint is allowed');
}
// The only shared writable API/daily-worker mount is the declared audit tree.
// Setgid directories must stay writable by the other slot after a new tenant
// directory is created. Web and the other worker keep a private umask.
process.umask(mode === 'api' || mode === 'langame-daily-worker' ? 0o007 : 0o077);
const metadata = JSON.parse(fs.readFileSync('/app/release.json', 'utf8'));
if (metadata.contract !== 'LEETPLUS_COMPOSE_BLUE_GREEN_V1' || process.env.RELEASE_SHA !== metadata.releaseSha ||
    process.env.BUILD_TIME !== metadata.builtAt || process.env.EXPECTED_DATABASE_MIGRATION !== metadata.migration ||
    process.env.EXPECTED_DATABASE_MIGRATION_COUNT !== String(metadata.migrationCount)) {
  throw new Error('Runtime environment does not match the immutable image release');
}
const unsafe = /^(?:NODE_(?:OPTIONS|PATH|EXTRA_CA_CERTS|DEBUG|USE_ENV_PROXY)|LD_|BASH_ENV$|ENV$|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$|SSLKEYLOGFILE$|OPENSSL_CONF$|OPENSSL_MODULES$|GCONV_PATH$|LOCPATH$|PRISMA_.*ENGINE)/i;
for (const key of Object.keys(process.env)) if (unsafe.test(key)) delete process.env[key];
if (mode !== 'web') {
  const secret = '/run/secrets/runtime.json';
  const stat = fs.lstatSync(secret);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536 || (stat.mode & 0o007)) throw new Error('Unsafe runtime secret file');
  const values = JSON.parse(fs.readFileSync(secret, 'utf8'));
  if (!values || Array.isArray(values) || typeof values !== 'object') throw new Error('Invalid runtime secret record');
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || unsafe.test(key) || typeof value !== 'string' || /[\r\n\0]/.test(value) ||
        Object.hasOwn(process.env, key)) throw new Error('Secret file cannot override the bound runtime environment');
    if (mode !== 'api' && !/^(DATABASE_URL|APP_ENCRYPTION_KEY|INTEGRATION_ENCRYPTION_KEY|LANGAME_|GUEST_)/.test(key)) {
      throw new Error('Worker received a secret outside its dedicated profile');
    }
    process.env[key] = value;
  }
}
if (mode === 'web' && Object.keys(process.env).some(k => /SECRET|PASSWORD|DATABASE_URL|ENCRYPTION|TOKEN/.test(k))) {
  throw new Error('Web runtime must not receive API/database secrets');
}
const child = spawn(process.execPath, commands[mode], {
  cwd: mode === 'web' ? '/app/apps/web' : '/app', stdio: 'inherit', env: process.env,
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Runtime child could not start'); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGTERM' ? 0 : 1); });

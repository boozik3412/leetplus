import fs from 'node:fs';
import path from 'node:path';

const [command, output] = process.argv.slice(2);
if (command !== 'write' || !output) throw new Error('Usage: image-metadata.mjs write <output>');
const sha = process.env.RELEASE_SHA;
const builtAt = process.env.BUILD_TIME;
if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(builtAt ?? '')) {
  throw new Error('Exact release SHA and UTC build time are required');
}
const root = path.resolve('packages/database/prisma/migrations');
const migrations = fs.readdirSync(root).filter(name => /^\d{14}_/.test(name) && fs.statSync(path.join(root, name)).isDirectory()).sort();
if (migrations.length !== 191 || migrations.at(-1) !== '20260908180000_external_langame_simple_onboarding') {
  throw new Error('Compose V1 requires reviewed CURRENT191');
}
fs.writeFileSync(output, `${JSON.stringify({ contract: 'LEETPLUS_COMPOSE_BLUE_GREEN_V1', releaseSha: sha, builtAt, migrationCount: migrations.length, migration: migrations.at(-1) }, null, 2)}\n`, { flag: 'wx' });

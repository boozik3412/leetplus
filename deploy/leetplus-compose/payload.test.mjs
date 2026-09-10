import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('every admitted control leaf, including systemd templates, fits the flat install boundary', () => {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const leaves = fs.readdirSync(root).filter(name => fs.statSync(path.join(root, name)).isFile());
  assert.ok(leaves.includes('leetplus-compose-worker@.service'));
  for (const leaf of leaves) assert.match(leaf, /^[a-zA-Z0-9_.@-]+$/);
  for (const unsafe of ['../outside', '/etc/passwd', 'subdir/file', 'name\0file', 'name\\file']) assert.ok(!/^[a-zA-Z0-9_.@-]+$/.test(unsafe));
});

test('prepared control replacement rejects active authority and changed predecessor bytes', () => {
  const root = path.dirname(fileURLToPath(import.meta.url));
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(root, 'test_prepared_handoff.py')], { stdio: 'pipe' });
});

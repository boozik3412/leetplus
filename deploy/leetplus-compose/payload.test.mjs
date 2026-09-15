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

test('prepared role modes survive the private caller umask on Linux', () => {
  const root = path.dirname(fileURLToPath(import.meta.url));
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(root, 'test_preparation_modes.py')], { stdio: 'pipe' });
});

test('provider refresh observations are bounded and reject unsafe state', () => {
  const root = path.dirname(fileURLToPath(import.meta.url));
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-I', '-S', '-E', path.join(root, 'test_network_observation.py')], { stdio: 'pipe' });
});

test('actual Linux flock bootstrap permits refresh during a worker and excludes concurrent writers', { skip: process.platform !== 'linux' || (process.getuid?.() !== 0 && process.env.GITHUB_ACTIONS !== 'true') }, () => {
  const root = path.dirname(fileURLToPath(import.meta.url));
  execFileSync('python3', [path.join(root, 'test_control_lock_runtime.py')], { stdio: 'pipe', timeout: 60000 });
});

test('stage-only installation has no serving effects and backup retains controller authority', () => {
  const root = path.dirname(fileURLToPath(import.meta.url));
  for (const name of ['test_control_stage.py', 'test_backup_observation.py']) {
    execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(root, name)], { stdio: 'pipe' });
  }
});

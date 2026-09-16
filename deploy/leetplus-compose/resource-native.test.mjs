import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

for (const leaf of ['test_resource_acceptance.py', 'test_sign_approval.py', 'test_rehearsal_memory_guard.py', 'test_resource_corpus.py', 'test_resource_cooldown.py']) {
  test(`native resource gate: ${leaf}`, () => {
    execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(path.dirname(fileURLToPath(import.meta.url)), leaf)], { stdio: 'pipe', timeout: 120000 });
  });
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT, SCHEMA, digest, canonical } from './contract.mjs';
import { DOWNLOAD_CONTRACT, acquire, validateRemote, verifyDownloadedBundle, hashFile } from './download-admitted-bundle.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leetplus-download-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const releaseSha = 'a'.repeat(40), input = { contract: DOWNLOAD_CONTRACT, releaseSha, admissionSha256: '', runId: '123', runAttempt: '1', artifactId: '456' };
  const manifest = { contract: CONTRACT, ...SCHEMA, releaseSha, builtAt: '2026-09-20T00:00:00Z', images: Object.fromEntries(['api', 'web', 'postgres', 'redis'].map((name, i) => [name, `sha256:${String(i + 1).repeat(64)}`])) };
  const files = { 'release.json': canonical(manifest), 'images.tar.gz': 'image-fixture', 'control.tar.gz': 'control-fixture', 'transport-validation.json': '{}', 'archive-roundtrip.json': '{}', 'network-validation.json': '{}' };
  const admission = { contract: CONTRACT + '_ADMISSION', decision: 'PASS', repository: 'boozik3412/leetplus', event: 'push', ref: 'refs/heads/main', releaseSha, runId: '123', runAttempt: '1', images: manifest.images };
  for (const [name, key] of Object.entries({ 'release.json': 'releaseManifestSha256', 'images.tar.gz': 'archiveSha256', 'control.tar.gz': 'controlArchiveSha256', 'transport-validation.json': 'transportValidationSha256', 'archive-roundtrip.json': 'archiveRoundtripSha256', 'network-validation.json': 'networkValidationSha256' })) admission[key] = digest(files[name]);
  files['docker-admission.json'] = canonical(admission); input.admissionSha256 = digest(files['docker-admission.json']);
  const run = { id: 123, run_attempt: 1, repository: { full_name: 'boozik3412/leetplus' }, head_repository: { full_name: 'boozik3412/leetplus' }, path: '.github/workflows/ci.yml', status: 'completed', conclusion: 'success', event: 'push', head_branch: 'main', head_sha: releaseSha };
  const artifact = { id: 456, name: `leetplus-compose-admitted-${releaseSha}-123-1`, expired: false, workflow_run: { id: 123, head_sha: releaseSha, head_branch: 'main' } };
  let downloads = 0;
  function executor({ loseResponse = false } = {}) {
    return (_command, args, options) => {
      let code;
      if (args[0] === 'api') code = `process.stdout.write(${JSON.stringify(JSON.stringify(args[1].includes('/artifacts/') ? artifact : run))})`;
      else {
        downloads++;
        code = `import fs from 'node:fs';import path from 'node:path';for(const [name,data] of Object.entries(${JSON.stringify(files)}))fs.writeFileSync(path.join(${JSON.stringify(root)},name),data);process.exit(${loseResponse ? 7 : 0});`;
      }
      return spawnSync(process.execPath, ['--input-type=module', '-e', code], options);
    };
  }
  return { root, input, files, run, artifact, executor, downloads: () => downloads };
}
test('real child transfer publishes verified receipt; restart reuses bytes without a second transfer', t => {
  const f = fixture(t); const first = acquire(f.input, f.root, { execute: f.executor() });
  assert.equal(first.contract, DOWNLOAD_CONTRACT); assert.equal(Object.keys(first.files).length, 7);
  assert.deepEqual(acquire(f.input, f.root, { execute: () => assert.fail('must not execute') }), first);
  assert.equal(f.downloads(), 1);
});
test('lost response after child wrote complete bytes reconciles without repeating transfer', t => {
  const f = fixture(t); assert.throws(() => acquire(f.input, f.root, { execute: f.executor({ loseResponse: true }) }), /download failed/);
  assert.equal(acquire(f.input, f.root, { execute: () => assert.fail('must not execute') }).decision, 'PASS');
  assert.equal(f.downloads(), 1);
});
test('accepted receipt does not hide modified files or changed input', t => {
  const f = fixture(t); acquire(f.input, f.root, { execute: f.executor() });
  assert.throws(() => acquire({ ...f.input, artifactId: '457' }, f.root), /input drift/);
  fs.writeFileSync(path.join(f.root, 'images.tar.gz'), 'changed');
  assert.throws(() => acquire(f.input, f.root), /digest mismatch/);
});
test('partial transfer remains unresolved and never calls downloader again', t => {
  const f = fixture(t); assert.throws(() => acquire(f.input, f.root, { execute: f.executor({ loseResponse: true }) }));
  fs.unlinkSync(path.join(f.root, 'images.tar.gz'));
  assert.throws(() => acquire(f.input, f.root, { execute: () => assert.fail('must not execute') }), /ENOENT/);
});
test('remote release identity is exact main/push/Full/attempt/artifact', t => {
  const f = fixture(t); validateRemote(f.input, f.run, f.artifact);
  for (const changes of [{ event: 'workflow_dispatch' }, { head_sha: 'b'.repeat(40) }, { conclusion: 'failure' }, { run_attempt: 2 }, { path: '.github/workflows/fast-ci.yml' }]) assert.throws(() => validateRemote(f.input, { ...f.run, ...changes }, f.artifact));
  assert.throws(() => validateRemote(f.input, f.run, { ...f.artifact, expired: true }));
});
test('manifest mismatch is rejected and hashing handles a multi-chunk file', t => {
  const f = fixture(t); acquire(f.input, f.root, { execute: f.executor() });
  fs.writeFileSync(path.join(f.root, 'release.json'), '{}'); assert.throws(() => verifyDownloadedBundle(f.input, f.root), /digest mismatch/);
  const large = Buffer.alloc(3 * 1024 * 1024 + 123, 42), target = path.join(f.root, 'large'); fs.writeFileSync(target, large);
  assert.deepEqual(hashFile(target), { sha256: digest(large), bytes: large.length });
});

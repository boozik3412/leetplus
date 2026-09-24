import assert from 'node:assert/strict';
import test from 'node:test';
import { ALLOWLIST, classify } from './classify-app-only.mjs';

const a = 'a'.repeat(40), b = 'b'.repeat(40), h = 'f'.repeat(64);
const file = { path: ALLOWLIST[0], status: 'M', ruleId: 'ORDINARY_RUNTIME', lane: 'L1_RUNTIME', reason: 'fixture' };
function fixtures() {
  const impact = { schemaVersion: 1, receiptType: 'LEETPLUS_RELEASE_IMPACT_RECEIPT_V1',
    baseSha: a, headSha: b, effectiveLane: 'L1_RUNTIME', minimumLane: 'L0_DOCS',
    inferredLane: 'L1_RUNTIME', mixedSourceLanes: false, sourceLaneSet: ['L1_RUNTIME'],
    changedFileCount: 1, files: [{ ...file }] };
  const candidate = { schemaVersion: 1, receiptType: 'LEETPLUS_RELEASE_CANDIDATE_RECEIPT_V1',
    deployableCandidate: true, decision: 'EXACT_MAIN_PUSH_DEPLOYABLE_CANDIDATE',
    eventName: 'push', ref: 'refs/heads/main', repository: 'boozik3412/leetplus',
    workflowRef: 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main',
    effectiveLane: 'L1_RUNTIME', runtimeArtifactEligible: true, releaseSha: b,
    workflowSha: b, eventBeforeSha: a, impactReceiptSha256: h };
  return { impact, candidate };
}
const hashes = { impactSha256: h, candidateSha256: h };
test('one exact reviewed display component has an app-only receipt', () => {
  const { impact, candidate } = fixtures();
  const result = classify(impact, candidate, hashes);
  assert.equal(result.releaseLane, 'L1_APP_ONLY');
  assert.deepEqual(result.changedPaths, [ALLOWLIST[0]]);
});
test('unknown, mixed, auth, schema, worker, dependency and renamed changes fail closed', () => {
  const blocked = [
    'apps/api/src/auth/auth.service.ts',
    'apps/api/src/tenancy/tenant.scope.ts',
    'packages/database/prisma/schema.prisma',
    'deploy/leetplus-compose/control.mjs',
    'apps/api/src/guest-gamification/bonus-worker.ts',
    'pnpm-lock.yaml',
    'apps/web/src/components/new-unknown.tsx',
  ];
  for (const path of blocked) {
    const { impact, candidate } = fixtures(); impact.files[0].path = path;
    assert.throws(() => classify(impact, candidate, hashes), /allowlist/);
  }
  for (const status of ['A', 'D', 'R']) {
    const { impact, candidate } = fixtures(); impact.files[0].status = status;
    assert.throws(() => classify(impact, candidate, hashes), /allowlist/);
  }
  {
    const { impact, candidate } = fixtures(); impact.mixedSourceLanes = true;
    assert.throws(() => classify(impact, candidate, hashes), /unmixed/);
  }
  {
    const { impact, candidate } = fixtures(); impact.effectiveLane = 'L2_SCHEMA_SECURITY';
    assert.throws(() => classify(impact, candidate, hashes), /unmixed/);
  }
});
test('non-main, mismatched base, tampered hash and non-deployable runs fail closed', () => {
  for (const mutation of [
    c => { c.ref = 'refs/heads/feature'; },
    c => { c.eventName = 'workflow_dispatch'; },
    c => { c.eventBeforeSha = 'c'.repeat(40); },
    c => { c.workflowSha = 'c'.repeat(40); },
    c => { c.impactReceiptSha256 = 'd'.repeat(64); },
    c => { c.deployableCandidate = false; },
  ]) {
    const { impact, candidate } = fixtures(); mutation(candidate);
    assert.throws(() => classify(impact, candidate, hashes), /exact main push/);
  }
});

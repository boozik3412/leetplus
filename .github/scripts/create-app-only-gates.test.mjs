import assert from 'node:assert/strict';
import test from 'node:test';
import { createGateReceipt } from './create-app-only-gates.mjs';

const releaseSha = 'a'.repeat(40), candidateHash = 'b'.repeat(64), appOnlyHash = 'c'.repeat(64);
const names = ['AUTHORITY_ROOT_TRUST', 'RELEASE_CRITICAL_APPLICATION',
  'RELEASE_CRITICAL_POSTGRESQL_ASSORTMENT', 'MIGRATION_SMOKE', 'COMPOSE_APP_RUNTIME'];
function input() {
  return { candidate: { releaseSha, deployableCandidate: true,
    decision: 'EXACT_MAIN_PUSH_DEPLOYABLE_CANDIDATE', ref: 'refs/heads/main', eventName: 'push' },
  appOnly: { contract: 'LEETPLUS_APP_ONLY_IMPACT_V2', decision: 'PASS', releaseLane: 'L1_APP_ONLY',
    releaseSha, candidateReceiptSha256: candidateHash }, candidateHash, appOnlyHash,
  results: Object.fromEntries(names.map(name => [name, 'success'])), releaseSha, runId: '1', runAttempt: '2' };
}
test('all exact Actions job results bind one main run', () => {
  const receipt = createGateReceipt(input());
  assert.deepEqual(receipt.requiredGates, names);
  assert.equal(receipt.runAttempt, '2');
  for (const name of names) assert.match(receipt.gateReceipts[name].sha256, /^[a-f0-9]{64}$/);
});
test('missing, failed, unexpected or mismatched results cannot publish PASS', () => {
  for (const mutate of [
    v => { delete v.results.MIGRATION_SMOKE; },
    v => { v.results.RELEASE_CRITICAL_APPLICATION = 'failure'; },
    v => { v.results.NEW = 'success'; },
    v => { v.appOnly.candidateReceiptSha256 = 'd'.repeat(64); },
    v => { v.candidate.ref = 'refs/heads/feature'; },
  ]) {
    const value = input(); mutate(value);
    assert.throws(() => createGateReceipt(value));
  }
});

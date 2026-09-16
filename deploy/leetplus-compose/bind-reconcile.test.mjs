import assert from 'node:assert/strict';
import test from 'node:test';
import { digest } from './contract.mjs';
import { reconcileBoundEvidence } from './bind-reconcile.mjs';

test('lost BIND receipt returns exact original timed evidence without replaying effects', () => {
  const plan = { targetSlot: 'green' }, spec = { services: {} }, checked = [];
  const evidence = { phase: 'BIND', planSha256: digest(plan), composeSha256: digest(spec), slot: 'green', resourceBudget: { capturedAt: 'old observation' } };
  const input = { plan, spec, evidence, composeSha256: digest(spec), fence: { planSha256: digest(plan), slot: 'green' }, assertStoppedConfiguration: name => checked.push(name) };
  assert.equal(reconcileBoundEvidence(input), evidence);
  assert.deepEqual(checked, ['api-green', 'web-green']);
  assert.throws(() => reconcileBoundEvidence({ ...input, composeSha256: 'different' }), /postimage drift/);
  assert.throws(() => reconcileBoundEvidence({ ...input, fence: { ...input.fence, slot: 'blue' } }), /postimage drift/);
  assert.throws(() => reconcileBoundEvidence({ ...input, evidence: { ...evidence, slot: 'blue' } }), /bind this plan/);
  assert.throws(() => reconcileBoundEvidence({ ...input, assertStoppedConfiguration: () => { throw new Error('target configuration drift'); } }), /configuration drift/);
});

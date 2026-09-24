import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { digest } from './contract.mjs';
import { createReadOnlyPhaseReconciler } from './control-reconcile.mjs';

const phases = ['HYDRATE', 'BIND', 'SMOKE', 'CUTOVER', 'POSTCHECK'];

test('installed control reconciliation has no phase executor or authenticated-session fallback', () => {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(root, 'control.mjs'), 'utf8');
  const block = source.match(/const observePhase = createReadOnlyPhaseReconciler\([\s\S]*?\n  driver\.reconcile =/u)?.[0];
  assert.ok(block, 'missing installed read-only reconciler');
  assert.doesNotMatch(block, /this\.run|driver\.run|authenticatedSmoke|compose\(\['(?:stop|up)'/u);
  assert.match(block, /SMOKE intent without durable evidence is ambiguous/u);
  assert.match(block, /POSTCHECK intent without durable evidence is ambiguous/u);
  assert.match(source, /driver\.reconcile = async \(phase, plan, \{ effectsAllowed = false \}/u);
  assert.match(source, /if \(!lifecycle\.receipt\) await bindForwardWorkerContinuation\(args\)/u);
  assert.doesNotMatch(source.match(/driver\.reconcile = async[\s\S]*?\n  return driver;/u)?.[0] ?? '',
    /this\.run|driver\.run|compose\(\['(?:stop|up)'/u);
});

test('every phase returns durable evidence through a read-only observer', async () => {
  const plan = { operationId: '63b58306-a711-4a0c-ba8c-07b3d9979e9c' };
  const records = Object.fromEntries(phases.map(phase => [phase, {
    intent: { phase, planSha256: digest(plan) },
    evidence: { phase, planSha256: digest(plan), marker: phase },
  }]));
  const observed = [];
  const reconcile = createReadOnlyPhaseReconciler({
    readState: async () => ({ records }),
    observers: Object.fromEntries(phases.map(phase => [phase, async (_plan, evidence) => {
      observed.push(phase);
      return evidence;
    }])),
  });
  for (const phase of phases) assert.deepEqual(await reconcile(phase, plan), records[phase].evidence);
  assert.deepEqual(observed, phases);
});

test('intent-only ambiguity fails closed without a phase executor fallback', async () => {
  const plan = { operationId: '63b58306-a711-4a0c-ba8c-07b3d9979e9c' };
  let observerCalls = 0;
  const reconcile = createReadOnlyPhaseReconciler({
    readState: async () => ({ records: { BIND: { intent: { phase: 'BIND', planSha256: digest(plan) } } } }),
    observers: {
      BIND: async () => {
        observerCalls += 1;
        throw new Error('BIND postimage is ambiguous');
      },
    },
  });
  await assert.rejects(reconcile('BIND', plan), /ambiguous/);
  assert.equal(observerCalls, 1);
});

test('reconciliation rejects replacement evidence and unbound observations', async () => {
  const plan = { operationId: '63b58306-a711-4a0c-ba8c-07b3d9979e9c' };
  const evidence = { phase: 'POSTCHECK', planSha256: digest(plan), marker: 'original' };
  const base = {
    readState: async () => ({ records: { POSTCHECK: { intent: { phase: 'POSTCHECK' }, evidence } } }),
  };
  await assert.rejects(createReadOnlyPhaseReconciler({
    ...base,
    observers: { POSTCHECK: async () => ({ ...evidence, marker: 'replacement' }) },
  })('POSTCHECK', plan), /changed durable evidence/);
  await assert.rejects(createReadOnlyPhaseReconciler({
    ...base,
    observers: { POSTCHECK: async () => ({ ...evidence, planSha256: '0'.repeat(64) }) },
  })('POSTCHECK', plan), /unbound evidence/);
});

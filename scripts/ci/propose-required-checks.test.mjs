import { test } from 'node:test';
import assert from 'node:assert/strict';
import { propose } from './propose-required-checks.mjs';

const sha = 'a'.repeat(40);
function fixture() {
  return { headSha: sha, additions: ['Critical HTTP', 'Critical PG'],
    protection: { required_status_checks: { strict: true, contexts: ['Existing'], checks: [{ context: 'Existing', app_id: 42 }] }, enforce_admins: { enabled: true }, allow_deletions: { enabled: false } },
    checkRuns: { total_count: 2, check_runs: ['Critical HTTP', 'Critical PG'].map((name, id) => ({ name, id: id + 1, head_sha: sha, app: { id: 15368 }, status: 'completed', conclusion: 'success' })) } };
}
test('proposal adds exact app-bound successes without modifying other rules or inputs', () => {
  const input = fixture(), before = structuredClone(input), result = propose(input);
  assert.deepEqual(input, before);
  assert.deepEqual(result.body.checks, [...input.protection.required_status_checks.checks, { context: 'Critical HTTP', app_id: 15368 }, { context: 'Critical PG', app_id: 15368 }]);
  assert.equal(result.body.strict, true);
  assert.deepEqual(Object.keys(result.body).sort(), ['checks', 'strict']);
  assert.deepEqual(result.diff.removed, []);
});
test('rerun failure supersedes previous success', () => {
  const input = fixture(); input.checkRuns.check_runs.push({ ...input.checkRuns.check_runs[0], id: 3, conclusion: 'failure' }); input.checkRuns.total_count++;
  assert.throws(() => propose(input), /Latest check/);
});
for (const [name, mutate] of [
  ['wrong SHA', x => { x.checkRuns.check_runs[0].head_sha = 'b'.repeat(40); }],
  ['wrong app', x => { x.checkRuns.check_runs[0].app.id = 99; }],
  ['skipped', x => { x.checkRuns.check_runs[0].conclusion = 'skipped'; }],
  ['partial pagination', x => { x.checkRuns.total_count++; }],
  ['missing existing binding', x => { x.protection.required_status_checks.checks = []; }],
]) test(`reject ${name}`, () => { const input = fixture(); mutate(input); assert.throws(() => propose(input)); });
test('already present requirements are preserved and not duplicated', () => {
  const input = fixture(); const first = propose(input);
  input.protection.required_status_checks = { ...first.body, contexts: first.body.checks.map(c => c.context) };
  assert.deepEqual(propose(input).diff.added, []);
});
test('GET null app binding becomes PATCH -1 without automatic app selection', () => {
  const input = fixture(); input.protection.required_status_checks.checks[0].app_id = null;
  assert.equal(propose(input).body.checks[0].app_id, -1);
  assert.equal(input.protection.required_status_checks.checks[0].app_id, null);
});

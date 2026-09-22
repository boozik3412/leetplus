#!/usr/bin/env node
// Offline proposal only. The caller supplies fresh GitHub GET responses;
// this program has no credentials, network transport or mutation command.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function propose({ protection, checkRuns, headSha, additions }) {
  assert(/^[a-f0-9]{40}$/.test(headSha ?? ''), 'Exact verified head SHA required');
  const current = protection?.required_status_checks;
  assert(current && typeof current.strict === 'boolean' && Array.isArray(current.contexts) && Array.isArray(current.checks), 'Complete protection GET response required');
  assert(Array.isArray(additions) && additions.length > 0 && new Set(additions).size === additions.length && additions.every(x => typeof x === 'string' && x.trim() === x && x.length > 0), 'Unique exact check names required');
  assert(Array.isArray(checkRuns?.check_runs) && checkRuns.total_count === checkRuns.check_runs.length, 'Complete check-run response required (collect all pages)');
  // Retain the app identity of every existing context, including unbound -1.
  const checks = structuredClone(current.checks);
  assert(checks.every(c => typeof c.context === 'string' && (Number.isInteger(c.app_id) || c.app_id === null)), 'Malformed existing app binding');
  // GET encodes an unbound app as null; PATCH requires integer -1 to preserve
  // that meaning. Omitting app_id would let GitHub choose a recent app.
  for (const check of checks) if (check.app_id === null) check.app_id = -1;
  assert(current.contexts.every(c => checks.some(item => item.context === c)), 'Existing context without app binding; refresh complete response');
  const added = [];
  for (const name of additions) {
    const matches = checkRuns.check_runs.filter(c => c.name === name && c.head_sha === headSha);
    assert(matches.length > 0, `No exact-head check: ${name}`);
    const apps = new Set(matches.map(c => c.app?.id));
    assert(apps.size === 1 && [...apps][0] === 15368, `Expected GitHub Actions app for ${name}`);
    // Only the latest run is authoritative after a rerun, never an older PASS.
    const latest = matches.toSorted((a, b) => b.id - a.id)[0];
    assert(Number.isSafeInteger(latest.id) && latest.status === 'completed' && latest.conclusion === 'success', `Latest check is not successful: ${name}`);
    if (!checks.some(c => c.context === name && c.app_id === latest.app.id)) {
      assert(!checks.some(c => c.context === name), `Existing binding differs for ${name}`);
      const entry = { context: name, app_id: latest.app.id };
      checks.push(entry);
      added.push(entry);
    }
  }
  return {
    decision: 'PROPOSED_NOT_APPLIED',
    repository: 'boozik3412/leetplus', branch: 'main', headSha,
    baselineProtectionSha256: hash(protection),
    endpoint: '/repos/boozik3412/leetplus/branches/main/protection/required_status_checks',
    method: 'PATCH',
    body: { strict: current.strict, checks },
    diff: { added, removed: [], strictBefore: current.strict, strictAfter: current.strict },
    activationPrecondition: 'Re-fetch the complete protection and compare baselineProtectionSha256 immediately before applying. Abort on any drift. PATCH only the required_status_checks subresource; verify every other protection field and repository ruleset remains unchanged.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  assert(input && output && process.argv.length === 4, 'Usage: node scripts/ci/propose-required-checks.mjs input.json new-proposal.json');
  const result = propose(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(`${result.decision}: ${result.diff.added.length} new checks; no GitHub mutation`);
}

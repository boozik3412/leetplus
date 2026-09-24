#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
function job(id) {
  const match = workflow.match(new RegExp(`(?:^|\\n)  ${id}:\\n[\\s\\S]*?(?=\\n  [a-z0-9_-]+:\\n|$)`, 'u'));
  assert.ok(match, `Missing ${id} job`);
  return match[0];
}
const impact = job('app-only-impact');
assert.match(impact, /continue-on-error: true/u, 'A B classifier failure must preserve successful V1 Full admission');
assert.match(impact, /needs: release_impact/u);
assert.match(impact, /deployable_candidate == 'true'.*effective_lane == 'L1_RUNTIME'/u);
assert.match(impact, /node \.github\/scripts\/classify-app-only\.mjs/u);
assert.match(impact, /eligible=false/u);
assert.match(impact, /pnpm install --frozen-lockfile --filter web\.\.\./u);
const images = job('compose-app-images');
assert.match(images, /continue-on-error: true/u, 'A B image failure must preserve successful V1 Full admission');
assert.match(images, /needs: app-only-impact/u);
assert.match(images, /needs\.app-only-impact\.outputs\.eligible == 'true'/u);
assert.match(images, /build-app-images\.sh/u);
assert.match(images, /artifact_digest: \$\{\{ steps\.upload\.outputs\.artifact-digest \}\}/u);
const admission = job('compose-app-admission');
assert.match(admission, /continue-on-error: true/u, 'A B admission failure must preserve successful V1 Full admission');
for (const required of ['release_impact', 'app-only-impact', 'compose-app-images', 'authority-root-trust',
  'release-critical-application', 'release-critical-postgresql-assortment', 'migration-smoke', 'application']) {
  assert.match(admission, new RegExp(`- ${required}(?:\n|\r?\n)`, 'u'), `B admission missing ${required}`);
}
assert.match(admission, /create-app-only-gates\.mjs/u);
assert.match(admission, /admit-app-images\.mjs/u);
assert.match(admission, /\[\[ "\$APP_ARTIFACT_DIGEST" =~ \^\[0-9a-f\]\{64\}\$ \]\]/u);
assert.match(admission, /"\$APP_ARTIFACT_ID" "\$APP_ARTIFACT_DIGEST"/u);
assert.doesNotMatch(admission, /APP_ARTIFACT_DIGEST#sha256:/u);
assert.match(admission, /leetplus-compose-app-admitted-/u);
for (const existing of ['release-handoff', 'compose-images', 'compose-handoff']) {
  const block = job(existing);
  assert.doesNotMatch(block, /app-only-impact/u, `${existing} must remain an intact V1/L2 fallback until B dual validation`);
}
console.log('APP_ONLY_WORKFLOW_CONTRACT=PASS');

#!/usr/bin/env node
// B is an additional, narrower decision over the already verified V1 impact
// and exact-main candidate receipts. It never downgrades their lane.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const CONTRACT = 'LEETPLUS_APP_ONLY_IMPACT_V2';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
// Deliberately exact files: adding a new component, route, API handler or
// dependency requires full admission until it is reviewed into this contract.
export const ALLOWLIST = Object.freeze([
  'apps/web/src/components/executive-trend-chart.tsx',
  'apps/web/src/components/revenue-trend-chart.tsx',
  'apps/web/src/components/no-sales-trend-chart.tsx',
  'apps/web/src/components/no-sales-period-table.tsx',
  'apps/web/src/components/executive-club-table.tsx',
  'apps/web/src/components/simple-report-table.tsx',
]);
const ALLOWED = new Set(ALLOWLIST);
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = raw => crypto.createHash('sha256').update(raw).digest('hex');
function demand(ok, message) { if (!ok) throw new Error(`app-only classifier: ${message}`); }
function exactKeys(value, keys, label) {
  demand(value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), `${label} shape drift`);
}
function readCanonical(file) {
  const stat = fs.lstatSync(file);
  demand(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size > 0 && stat.size <= 1024 * 1024, 'unsafe receipt file');
  const raw = fs.readFileSync(file, 'utf8');
  const value = JSON.parse(raw);
  demand(raw === canonical(value), 'noncanonical receipt');
  return { raw, value };
}
function verifyScript(script, args, root) {
  const result = spawnSync(process.execPath, [path.join(HERE, script), ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GIT_|LD_|DYLD_)/i.test(key) && !['NODE_OPTIONS', 'NODE_PATH'].includes(key))),
  });
  demand(!result.error && result.status === 0 && result.signal === null, `${script} verification failed: ${(result.stderr ?? '').trim().slice(0, 500)}`);
}
function gitSource(root, sha, file) {
  const result = spawnSync('git', ['show', `${sha}:${file}`], {
    cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GIT_|LD_|DYLD_)/i.test(key))),
  });
  demand(!result.error && result.status === 0 && result.signal === null, `cannot read exact source: ${file}`);
  return result.stdout;
}
function displayShape(source, ts) {
  const parsed = ts.createSourceFile('display.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  demand(parsed.parseDiagnostics.length === 0, 'invalid display component syntax');
  const statements = parsed.statements;
  demand(statements[0] && ts.isExpressionStatement(statements[0]) &&
    ts.isStringLiteral(statements[0].expression) && statements[0].expression.text === 'use client',
  'app-only component must remain client rendered');
  function visit(node) {
    if (ts.isJsxText(node)) return ['jsx-text'];
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) &&
      /^(aria-label|title|alt)$/.test(node.name.text)) {
      return ['safe-jsx-attribute', node.name.text];
    }
    const children = [];
    ts.forEachChild(node, child => { children.push(visit(child)); });
    return children.length ? [node.kind, children] : [node.kind, node.getText(parsed)];
  }
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
  const comments = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      comments.push(scanner.getTokenText());
    }
  }
  return JSON.stringify([visit(parsed), comments]);
}
export function verifyDisplayOnlyChange(before, after, ts) {
  demand(displayShape(before, ts) === displayShape(after, ts),
    'component changed behavior, imports or executable structure');
}
export function classify(impact, candidate, { impactSha256, candidateSha256 }) {
  demand(impact?.schemaVersion === 1 && impact.receiptType === 'LEETPLUS_RELEASE_IMPACT_RECEIPT_V1' &&
    impact.effectiveLane === 'L1_RUNTIME' && impact.minimumLane === 'L0_DOCS' && impact.inferredLane === 'L1_RUNTIME' &&
    impact.mixedSourceLanes === false && JSON.stringify(impact.sourceLaneSet) === '["L1_RUNTIME"]' &&
    Array.isArray(impact.files) && impact.files.length > 0 && impact.changedFileCount === impact.files.length,
  'trusted impact is not one unmixed runtime lane');
  demand(candidate?.schemaVersion === 1 && candidate.receiptType === 'LEETPLUS_RELEASE_CANDIDATE_RECEIPT_V1' &&
    candidate.deployableCandidate === true && candidate.decision === 'EXACT_MAIN_PUSH_DEPLOYABLE_CANDIDATE' &&
    candidate.eventName === 'push' && candidate.ref === 'refs/heads/main' && candidate.repository === 'boozik3412/leetplus' &&
    candidate.workflowRef === 'boozik3412/leetplus/.github/workflows/ci.yml@refs/heads/main' &&
    candidate.effectiveLane === 'L1_RUNTIME' && candidate.runtimeArtifactEligible === true &&
    candidate.workflowSha === candidate.releaseSha && candidate.releaseSha === impact.headSha &&
    candidate.eventBeforeSha === impact.baseSha && candidate.impactReceiptSha256 === impactSha256,
  'candidate is not the exact main push for the trusted impact');
  demand(SHA.test(impact.baseSha) && SHA.test(impact.headSha) && HASH.test(impactSha256) && HASH.test(candidateSha256), 'invalid digest or source identity');
  for (const file of impact.files) {
    exactKeys(file, ['path', 'status', 'ruleId', 'lane', 'reason'], 'changed file');
    demand(file.status === 'M' && file.lane === 'L1_RUNTIME' && file.ruleId === 'ORDINARY_RUNTIME' && ALLOWED.has(file.path),
      `outside closed app-only allowlist: ${file.path}`);
  }
  return {
    contract: CONTRACT, decision: 'PASS', releaseLane: 'L1_APP_ONLY',
    releaseSha: impact.headSha, diffBaseSha: impact.baseSha,
    impactReceiptSha256: impactSha256, candidateReceiptSha256: candidateSha256,
    allowlistSha256: sha256(canonical(ALLOWLIST)),
    changedPaths: impact.files.map(file => file.path),
  };
}
export function verifyAndClassify({ root, impactFile, candidateFile }) {
  const impact = readCanonical(impactFile), candidate = readCanonical(candidateFile);
  demand(path.resolve(root) === fs.realpathSync(root), 'repository root must be canonical');
  verifyScript('classify-release-impact.mjs', ['--root', root, '--base-sha', impact.value.baseSha,
    '--head-sha', impact.value.headSha, '--minimum-lane', impact.value.minimumLane,
    '--verify-receipt', impactFile], root);
  verifyScript('classify-release-candidate.mjs', ['--root', root, '--release-sha', candidate.value.releaseSha,
    '--event-name', candidate.value.eventName, '--ref', candidate.value.ref,
    '--event-before-sha', candidate.value.eventBeforeSha, '--repository', candidate.value.repository,
    '--workflow-ref', candidate.value.workflowRef, '--workflow-sha', candidate.value.workflowSha,
    '--impact-receipt', impactFile, '--verify-receipt', candidateFile], root);
  const result = classify(impact.value, candidate.value, {
    impactSha256: sha256(impact.raw), candidateSha256: sha256(candidate.raw),
  });
  const requireFromWeb = createRequire(path.join(root, 'apps/web/package.json'));
  const ts = requireFromWeb('typescript');
  for (const file of impact.value.files) {
    verifyDisplayOnlyChange(gitSource(root, impact.value.baseSha, file.path),
      gitSource(root, impact.value.headSha, file.path), ts);
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [root, impactFile, candidateFile, outputFile] = process.argv.slice(2);
    demand(root && impactFile && candidateFile && outputFile, 'expected root, impact receipt, candidate receipt, output');
    const result = verifyAndClassify({ root: path.resolve(root), impactFile: path.resolve(impactFile), candidateFile: path.resolve(candidateFile) });
    fs.writeFileSync(outputFile, canonical(result), { flag: 'wx', mode: 0o440 });
    process.stdout.write(`APP_ONLY_CLASSIFICATION=PASS releaseSha=${result.releaseSha}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

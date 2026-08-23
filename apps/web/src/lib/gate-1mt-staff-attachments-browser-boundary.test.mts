import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const API_ROUTE_ROOT = fileURLToPath(new URL("../app/api", import.meta.url));
const API_STAFF_ATTACHMENT_PG_SPEC = path.join(
  REPO_ROOT,
  "apps/api/test/pilot-staff-attachments-scope.pg.integration-spec.ts",
);
const CI_WORKFLOW = path.join(REPO_ROOT, ".github/workflows/ci.yml");

const STAFF_ATTACHMENT_PARENT_KINDS = [
  "CHAT_MESSAGE",
  "STAFF_TASK",
  "CHECKLIST_RUN",
  "KNOWLEDGE_ARTICLE",
  "SHIFT_REGULATION",
  "TRAINING_COURSE",
  "ONBOARDING_PLAN",
] as const;

const STORE_AWARE_BROWSER_EVIDENCE_FILES = [
  "docs/open-beta/gate-1mt-knowledge-stores-evidence-2026-08-19.md",
  "docs/open-beta/gate-1mt-shift-regulations-stores-evidence-2026-08-19.md",
  "docs/open-beta/gate-1mt-training-stores-evidence-2026-08-19.md",
  "docs/open-beta/gate-1mt-onboarding-stores-evidence-2026-08-19.md",
  "docs/open-beta/gate-1mt-checklists-stores-evidence-2026-08-19.md",
] as const;

test("keeps Gate 1MT staff attachment browser prerequisites admitted in CI", async () => {
  const workflow = await readFile(CI_WORKFLOW, "utf8");

  assert.match(
    workflow,
    /pnpm --filter web test:gate-1mt-staff-attachments-browser-boundary/,
  );
  assert.match(workflow, /pnpm --filter web test:pilot-bff-boundary/);
  assert.match(workflow, /pnpm --filter web build/);
  assert.match(
    workflow,
    /pnpm --filter api test:integration:pilot-staff-attachments-scope:pg/,
  );
  assert.match(workflow, /PILOT_STAFF_ATTACHMENTS_SCOPE_PG_CONFIRM/);
});

test("keeps staff attachment file BFF selector-free for browser downloads", async () => {
  const [uploadSource, downloadSource, proxySource] = await Promise.all([
    readFile(path.join(API_ROUTE_ROOT, "staff/attachments/route.ts"), "utf8"),
    readFile(
      path.join(API_ROUTE_ROOT, "staff/attachments/[id]/route.ts"),
      "utf8",
    ),
    readFile(fileURLToPath(new URL("proxy.ts", import.meta.url)), "utf8"),
  ]);

  assert.match(
    uploadSource,
    /const url = `\/api\/staff\/attachments\/\$\{encodeURIComponent\(data\.id\)\}`/,
  );
  assert.doesNotMatch(uploadSource, /new URL\([\s\S]*request\.url/);
  assert.doesNotMatch(uploadSource, /\.toString\(\)/);
  assert.match(downloadSource, /encodeURIComponent\(id\)/);
  assert.match(downloadSource, /forwardQuery:\s*false/);
  assert.doesNotMatch(downloadSource, /request\.url/);
  assert.match(
    proxySource,
    /const search = options\.forwardQuery === false \? "" : url\.search/,
  );
});

test("keeps all staff attachment parent lifecycle kinds covered by PostgreSQL matrix", async () => {
  const source = await readFile(API_STAFF_ATTACHMENT_PG_SPEC, "utf8");

  assert.match(
    source,
    /it\('atomically binds native writer references for all five staff parent kinds'/,
  );
  assert.match(
    source,
    /it\('rejects raw parent deletes that would orphan bound attachment authority'/,
  );
  assert.match(
    source,
    /it\('serializes native bind, unbind, and replacement races without orphan authority'/,
  );
  assert.match(
    source,
    /it\('denies attachment bytes when persisted user authority is revoked first'/,
  );
  assert.match(
    source,
    /it\('denies attachment bytes when custom or system role capabilities are revoked first'/,
  );

  const deleteGuardBlock = source.slice(
    source.indexOf(
      "it('rejects raw parent deletes that would orphan bound attachment authority'",
    ),
    source.indexOf("it('serializes native bind, unbind"),
  );
  for (const resourceKind of STAFF_ATTACHMENT_PARENT_KINDS) {
    assert.match(
      deleteGuardBlock,
      new RegExp(`StaffAttachmentResourceKind\\.${resourceKind}\\b`),
      `${resourceKind} is missing from the parent-delete guard matrix`,
    );
  }
  assert.match(deleteGuardBlock, /countAttachmentParentDeleteGuardTriggers/);
  assert.match(deleteGuardBlock, /resolves\.toBe\(parents\.length\)/);
});

test("keeps accepted STORES browser evidence linked until live archive/orphan matrix is added", async () => {
  const [readme, ...evidenceFiles] = await Promise.all([
    readFile(path.join(REPO_ROOT, "docs/open-beta/README.md"), "utf8"),
    ...STORE_AWARE_BROWSER_EVIDENCE_FILES.map((file) =>
      readFile(path.join(REPO_ROOT, file), "utf8"),
    ),
  ]);

  for (const file of STORE_AWARE_BROWSER_EVIDENCE_FILES) {
    assert.match(readme, new RegExp(file.replace("docs/open-beta/", "")));
  }
  for (const evidence of evidenceFiles) {
    assert.match(evidence, /production-build/i);
    assert.match(evidence, /\bB1\b/);
    assert.match(evidence, /\bB2\b/);
    assert.match(evidence, /STORES/);
    assert.match(evidence, /`404`|fail-closed/);
    assert.match(evidence, /NO-GO|не разрешает внешний доступ/i);
  }
});

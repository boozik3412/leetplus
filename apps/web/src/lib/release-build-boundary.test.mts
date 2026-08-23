import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { resolveReleaseBuildId } from "../../next.config.ts";

test("keeps the production web build independent from remote font downloads", async () => {
  const layout = await readFile(
    fileURLToPath(new URL("../app/layout.tsx", import.meta.url)),
    "utf8",
  );
  const globals = await readFile(
    fileURLToPath(new URL("../app/globals.css", import.meta.url)),
    "utf8",
  );

  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.doesNotMatch(layout, /fonts\.googleapis\.com/);
  assert.match(globals, /--font-system-sans:/);
  assert.match(globals, /--font-system-mono:/);
});

test("binds the web build ID to the exact release SHA", () => {
  const releaseSha = "a".repeat(40);

  assert.equal(
    resolveReleaseBuildId({ CI_RELEASE_SHA: releaseSha }),
    releaseSha,
  );
  assert.equal(resolveReleaseBuildId({ RELEASE_SHA: releaseSha }), releaseSha);
  assert.equal(
    resolveReleaseBuildId({
      CI_RELEASE_SHA: releaseSha,
      RELEASE_SHA: releaseSha,
    }),
    releaseSha,
  );
  assert.equal(resolveReleaseBuildId({}), null);
});

test("rejects malformed or conflicting release build identities", () => {
  assert.throws(
    () => resolveReleaseBuildId({ CI_RELEASE_SHA: "not-a-sha" }),
    /lowercase 40-character Git SHA/,
  );
  assert.throws(
    () =>
      resolveReleaseBuildId({
        CI_RELEASE_SHA: "a".repeat(40),
        RELEASE_SHA: "b".repeat(40),
      }),
    /must identify the same commit/,
  );
});

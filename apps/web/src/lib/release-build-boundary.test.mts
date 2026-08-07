import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

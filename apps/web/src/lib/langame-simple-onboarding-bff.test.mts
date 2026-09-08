import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PREVIEW_ROUTE = fileURLToPath(
  new URL(
    "../app/api/integrations/langame/settings/preview/route.ts",
    import.meta.url,
  ),
);
const SETTINGS_FORM = fileURLToPath(
  new URL("../components/langame-settings-form.tsx", import.meta.url),
);

test("keeps Langame discovery behind the authenticated private BFF", async () => {
  const source = await readFile(PREVIEW_ROUTE, "utf8");

  assert.match(source, /proxyJsonRequest/u);
  assert.match(source, /\/integrations\/langame\/settings\/preview/u);
  assert.match(source, /privateNoStore:\s*true/u);
  assert.match(source, /forwardQuery:\s*false/u);
  assert.doesNotMatch(source, /request\.headers\.get\(["']authorization/iu);
});

test("uses the simple automatic-or-explicit club selection flow", async () => {
  const source = await readFile(SETTINGS_FORM, "utf8");

  assert.match(source, /connectionMode === ["']SAFE_EXTERNAL["']/u);
  assert.match(source, /settings\/preview/u);
  assert.match(source, /automaticBindings/u);
  assert.match(source, /requiresSelection/u);
  assert.match(source, /Выберите клубы вашей сети/u);
  assert.match(source, /clubBindings/u);
  assert.match(source, /mode:\s*["']BACKFILL["']/u);
  assert.match(source, /trigger:\s*["']MANUAL["']/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/u);
});

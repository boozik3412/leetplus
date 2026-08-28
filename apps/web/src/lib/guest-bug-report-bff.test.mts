import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const sourceRoot = path.resolve(import.meta.dirname, "..");

test("keeps the guest bug-report upload on a dedicated scoped BFF route", async () => {
  const route = await readFile(
    path.join(sourceRoot, "app", "api", "guest-support", "bug-report", "route.ts"),
    "utf8",
  );

  assert.match(route, /await request\.formData\(\)/);
  assert.match(route, /GUEST_AUTH_COOKIE_NAME/);
  assert.match(route, /Idempotency-Key/);
  assert.match(route, /\/guest-portal\/session\/support\/bug-reports/);
  assert.match(route, /MAX_IMAGE_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
  assert.doesNotMatch(route, /phone|cookie.*upstream|request\.headers\.entries/i);
});

test("renders the server-owned incident topics and bounded image input", async () => {
  const component = await readFile(
    path.join(sourceRoot, "components", "guest-bug-report.tsx"),
    "utf8",
  );

  assert.match(component, /configuration\.topics\.map/);
  assert.match(component, /configuration\.maxAttachmentBytes/);
  assert.match(component, /minLength=\{30\}/);
  assert.match(component, /maxLength=\{2000\}/);
  assert.match(component, /accept="image\/jpeg,image\/png,image\/webp"/);
});

test("keeps tenant and platform ticket mutations on separate private BFF routes", async () => {
  const routes = [
    ["support", "bug-reports", "[id]", "route.ts"],
    ["support", "bug-reports", "[id]", "comments", "route.ts"],
    ["admin", "support-tickets", "[id]", "route.ts"],
    ["admin", "support-tickets", "[id]", "comments", "route.ts"],
  ];

  for (const segments of routes) {
    const route = await readFile(
      path.join(sourceRoot, "app", "api", ...segments),
      "utf8",
    );
    assert.match(route, /proxyJsonRequest/);
    assert.match(route, /privateNoStore:\s*true/);
    assert.match(route, /forwardQuery:\s*false/);
  }
});

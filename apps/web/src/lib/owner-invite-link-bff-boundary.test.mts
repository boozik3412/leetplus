import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const STATUS_ROUTE = fileURLToPath(
  new URL(
    "../app/api/admin/tenants/[id]/initial-owner-invite/route.ts",
    import.meta.url,
  ),
);
const PUBLISH_ROUTE = fileURLToPath(
  new URL(
    "../app/api/admin/tenants/[id]/initial-owner-invite/publish-link/route.ts",
    import.meta.url,
  ),
);
const ADMINISTRATION_WORKSPACE = fileURLToPath(
  new URL("../components/platform-administration-workspace.tsx", import.meta.url),
);

test("keeps owner-invite status and link publication behind private BFF routes", async () => {
  const [statusRoute, publishRoute] = await Promise.all([
    readFile(STATUS_ROUTE, "utf8"),
    readFile(PUBLISH_ROUTE, "utf8"),
  ]);

  assert.match(statusRoute, /export async function GET/u);
  assert.match(publishRoute, /export async function POST/u);
  for (const source of [statusRoute, publishRoute]) {
    assert.match(source, /proxyJsonRequest/u);
    assert.match(source, /encodeURIComponent\(id\)/u);
    assert.match(source, /privateNoStore:\s*true/u);
    assert.doesNotMatch(source, /request\.headers\.get\(["']authorization/iu);
  }
  assert.match(publishRoute, /initial-owner-invite\/publish-link/u);
});

test("places the direct-link choice and one-time secret handling on administration", async () => {
  const source = await readFile(ADMINISTRATION_WORKSPACE, "utf8");

  assert.match(source, /Создать ссылку доступа/u);
  assert.match(source, /Ссылка без почты/u);
  assert.match(source, /Отправка на почту/u);
  assert.match(source, /navigator\.clipboard\.writeText/u);
  assert.match(source, /PUBLISH OWNER INVITE LINK/u);
  assert.match(source, /registrationUrl:\s*null/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/u);
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { resolveWebReleaseIdentity } from "./web-release-identity.ts";

const RELEASE_SHA = "a".repeat(40);

async function withWebFixture(
  buildId: string,
  run: (webRoot: string) => Promise<void>,
) {
  const webRoot = await mkdtemp(join(tmpdir(), "leetplus-web-release-"));
  try {
    await mkdir(join(webRoot, ".next"));
    await writeFile(join(webRoot, ".next", "BUILD_ID"), buildId, "utf8");
    await run(webRoot);
  } finally {
    await rm(webRoot, { recursive: true, force: true });
  }
}

test("accepts only one aggregate identity shared by runtime env and BUILD_ID", async () => {
  for (const buildIdRecord of [
    RELEASE_SHA,
    `${RELEASE_SHA}\n`,
    `${RELEASE_SHA}\r\n`,
  ]) {
    await withWebFixture(buildIdRecord, async (webRoot) => {
      assert.deepEqual(
        await resolveWebReleaseIdentity(
          { RELEASE_SHA, WEB_BUILD_ID: RELEASE_SHA },
          webRoot,
        ),
        { sha: RELEASE_SHA, webBuildId: RELEASE_SHA },
      );
    });
  }
});

test("fails closed for missing, malformed, uppercase or conflicting runtime identity", async () => {
  await withWebFixture(RELEASE_SHA, async (webRoot) => {
    for (const environment of [
      { RELEASE_SHA: undefined, WEB_BUILD_ID: RELEASE_SHA },
      { RELEASE_SHA, WEB_BUILD_ID: undefined },
      { RELEASE_SHA: "not-a-sha", WEB_BUILD_ID: RELEASE_SHA },
      { RELEASE_SHA: RELEASE_SHA.toUpperCase(), WEB_BUILD_ID: RELEASE_SHA },
      { RELEASE_SHA: ` ${RELEASE_SHA}`, WEB_BUILD_ID: RELEASE_SHA },
      { RELEASE_SHA, WEB_BUILD_ID: `${RELEASE_SHA}\n` },
      { RELEASE_SHA, WEB_BUILD_ID: "b".repeat(40) },
    ]) {
      await assert.rejects(resolveWebReleaseIdentity(environment, webRoot));
    }
  });
});

test("fails closed when the on-disk BUILD_ID is not exact", async () => {
  for (const buildIdRecord of [
    "b".repeat(40),
    `${RELEASE_SHA} `,
    ` ${RELEASE_SHA}`,
    `${RELEASE_SHA}\n\n`,
    RELEASE_SHA.toUpperCase(),
    "x".repeat(129),
  ]) {
    await withWebFixture(buildIdRecord, async (webRoot) => {
      await assert.rejects(
        resolveWebReleaseIdentity(
          { RELEASE_SHA, WEB_BUILD_ID: RELEASE_SHA },
          webRoot,
        ),
      );
    });
  }
});

test("requires BUILD_ID to be a regular file", async () => {
  const webRoot = await mkdtemp(join(tmpdir(), "leetplus-web-release-"));
  try {
    await mkdir(join(webRoot, ".next", "BUILD_ID"), { recursive: true });
    await assert.rejects(
      resolveWebReleaseIdentity(
        { RELEASE_SHA, WEB_BUILD_ID: RELEASE_SHA },
        webRoot,
      ),
      /bounded regular file/,
    );
  } finally {
    await rm(webRoot, { recursive: true, force: true });
  }
});

test("keeps the route dynamic, Node-only, no-store and fail-closed", async () => {
  const route = await import("node:fs/promises").then(({ readFile }) =>
    readFile(
      fileURLToPath(
        new URL("../app/api/release-identity/route.ts", import.meta.url),
      ),
      "utf8",
    ),
  );

  assert.match(route, /import "server-only"/u);
  assert.match(route, /export const runtime = "nodejs"/u);
  assert.match(route, /export const dynamic = "force-dynamic"/u);
  assert.match(route, /export const revalidate = 0/u);
  assert.match(route, /"Cache-Control": "no-store, max-age=0"/u);
  assert.match(route, /status: 200/u);
  assert.match(route, /status: 503/u);
  assert.match(route, /WEB_RELEASE_IDENTITY_UNAVAILABLE/u);
  assert.doesNotMatch(route, /error\.message|String\(error\)|stack/u);
});

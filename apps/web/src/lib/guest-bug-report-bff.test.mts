import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const sourceRoot = path.resolve(import.meta.dirname, "..");

test("keeps the guest bug-report upload on a dedicated scoped BFF route", async () => {
  const route = await readFile(
    path.join(
      sourceRoot,
      "app",
      "api",
      "guest-support",
      "bug-report",
      "route.ts",
    ),
    "utf8",
  );

  assert.match(route, /await request\.formData\(\)/);
  assert.match(route, /GUEST_AUTH_COOKIE_NAME/);
  assert.match(route, /Idempotency-Key/);
  assert.match(route, /\/guest-portal\/session\/support\/bug-reports/);
  assert.match(route, /MAX_IMAGE_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
  assert.doesNotMatch(
    route,
    /phone|cookie.*upstream|request\.headers\.entries/i,
  );
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
  assert.match(component, /createPortal\(/);
  assert.match(component, /document\.body/);
});

test("keeps the game header inside the module width and aligns support controls", async () => {
  const game = await readFile(
    path.join(sourceRoot, "app", "play", "game", "game-summary-client.tsx"),
    "utf8",
  );
  const supportStyles = await readFile(
    path.join(sourceRoot, "components", "guest-bug-report.module.css"),
    "utf8",
  );

  assert.match(game, /className="lp-club-topbar-inner"/);
  assert.match(
    game,
    /\.lp-club-topbar-inner\s*\{[\s\S]*?width:\s*min\(1480px, 100%\)/,
  );
  assert.match(game, /--lp-club-header-control-size:\s*44px/);
  assert.match(game, /height:\s*var\(--lp-club-header-control-size\)/);
  assert.match(
    supportStyles,
    /width:\s*var\(--lp-club-header-control-size, 44px\)/,
  );
  assert.match(
    supportStyles,
    /border:\s*var\s*\(\s*--lp-club-header-control-border/,
  );
});

test("does not present the onboarding journey as a battle pass with fictitious rewards", async () => {
  const game = await readFile(
    path.join(sourceRoot, "app", "play", "game", "game-summary-client.tsx"),
    "utf8",
  );

  assert.match(
    game,
    /\{summary\.battlePass\.active\?\.levels\.length\s*\?\s*\([\s\S]*?<HomeBattlePass/,
  );
  assert.doesNotMatch(
    game,
    /seasonName=\{summary\.battlePass\.active\?\.name\s*\?\?\s*"Сезон клуба"\}/,
  );
});

test("shows a Battle Pass save failure next to the save action", async () => {
  const panel = await readFile(
    path.join(sourceRoot, "components", "guest-gamification-panel.tsx"),
    "utf8",
  );

  assert.match(panel, /<SeasonsTab[\s\S]*?error=\{error\}/);
  assert.match(
    panel,
    /\{error \? \([\s\S]*?role="alert"[\s\S]*?\{error\}[\s\S]*?<button[\s\S]*?onClick=\{onSave\}/,
  );
});

test("labels the reward delivery method on every saved Battle Pass card", async () => {
  const panel = await readFile(
    path.join(sourceRoot, "components", "guest-gamification-panel.tsx"),
    "utf8",
  );

  assert.match(
    panel,
    /item\.manualApprovalRequired\s*\?\s*"выдача: после подтверждения сотрудником"\s*:\s*"выдача: автоматически"/,
  );
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

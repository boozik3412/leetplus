import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  GAME_TUTORIAL_STEPS,
  GAME_TUTORIAL_VERSION,
  gameTutorialStepsFor,
} from "../app/play/game/_game/tutorial/steps.ts";
import { projectGuestPortalPostBody } from "./guest-portal-bff.ts";

const GAME_ROOT = fileURLToPath(new URL("../app/play/game", import.meta.url));
const TUTORIAL_ROOT = path.join(GAME_ROOT, "_game", "tutorial");

async function gameScreenSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entryPath !== TUTORIAL_ROOT) {
        sources.push(...(await gameScreenSources(entryPath)));
      }
    } else if (entry.name.endsWith(".tsx")) {
      sources.push(await readFile(entryPath, "utf8"));
    }
  }

  return sources;
}

test("every tutorial target still exists on the game screen", async () => {
  // The tour finds blocks by their existing ids/classes. When markup moves or
  // is renamed this fails instead of the step silently disappearing.
  const source = (await gameScreenSources(GAME_ROOT)).join("\n");
  const selectors = GAME_TUTORIAL_STEPS.flatMap((step) => step.targets ?? []);

  assert.ok(selectors.length > 0);

  for (const selector of selectors) {
    const match = /^([.#])([A-Za-z][\w-]*)$/u.exec(selector);
    assert.ok(match, `Unsupported tutorial selector ${selector}`);
    const [, kind, name] = match;
    const pattern =
      kind === "#"
        ? new RegExp(`id="${name}"`, "u")
        : new RegExp(`["\\s]${name}["\\s]`, "u");

    assert.match(source, pattern, `${selector} is not on the game screen`);
  }
});

test("the tour starts with a welcome card and has unique steps", () => {
  assert.ok(Number.isInteger(GAME_TUTORIAL_VERSION));
  assert.ok(GAME_TUTORIAL_VERSION >= 1 && GAME_TUTORIAL_VERSION <= 1000);
  assert.equal(GAME_TUTORIAL_STEPS[0]?.targets, null);
  assert.equal(
    new Set(GAME_TUTORIAL_STEPS.map((step) => step.id)).size,
    GAME_TUTORIAL_STEPS.length,
  );
  assert.match(GAME_TUTORIAL_STEPS[0].body("Клуб 1337"), /Клуб 1337/u);
});

test("the game accounts step shows only where the network turned it on", () => {
  const off = gameTutorialStepsFor({ gameAccounts: false }).map((s) => s.id);
  const on = gameTutorialStepsFor({ gameAccounts: true }).map((s) => s.id);

  assert.ok(!off.includes("game-accounts"));
  assert.ok(on.includes("game-accounts"));
  assert.equal(on.length, off.length + 1);
  // It comes before the menu step, which already points at the menu button.
  assert.equal(on.indexOf("game-accounts") + 1, on.indexOf("menu"));
  assert.match(
    GAME_TUTORIAL_STEPS.find((s) => s.id === "game-accounts")!.body(""),
    /Steam/u,
  );
});

test("guests who saw an older tour get only the new steps", () => {
  const ids = (steps: { id: string }[]) => steps.map((s) => s.id);
  const all = gameTutorialStepsFor({ gameAccounts: true }, "full", 1);

  // A full tour ignores what was seen; an update shows only newer steps.
  assert.equal(all.length, GAME_TUTORIAL_STEPS.length);
  assert.deepEqual(
    ids(gameTutorialStepsFor({ gameAccounts: true }, "updates", 1)),
    ["game-accounts"],
  );
  assert.deepEqual(
    ids(gameTutorialStepsFor({ gameAccounts: false }, "updates", 1)),
    [],
  );
  assert.deepEqual(
    ids(
      gameTutorialStepsFor(
        { gameAccounts: true },
        "updates",
        GAME_TUTORIAL_VERSION,
      ),
    ),
    [],
  );
  // Every step's version exists: nothing is added "from the future".
  for (const step of GAME_TUTORIAL_STEPS) {
    assert.ok((step.since ?? 1) <= GAME_TUTORIAL_VERSION, step.id);
  }
});

test("the web BFF forwards only the tutorial version", () => {
  assert.deepEqual(
    projectGuestPortalPostBody(
      ["session", "tutorial"],
      JSON.stringify({ version: GAME_TUTORIAL_VERSION }),
    ),
    { ok: true, body: JSON.stringify({ version: GAME_TUTORIAL_VERSION }) },
  );
  assert.equal(
    projectGuestPortalPostBody(
      ["session", "tutorial"],
      JSON.stringify({ version: 1, tutorialSeenAt: "2026-01-01" }),
    ).ok,
    false,
  );
});

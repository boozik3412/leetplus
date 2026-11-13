// The wait notice of heavy screens never turns into an error.
//
// A timer cannot know that a request failed, and big screens such as
// «Клиентская база» often answer after 45 s. An error shown by the timer hung
// over the page until the data arrived (owner, 13.11.2026). Real failures are
// the route's error.tsx. Rule: docs/agent-context/loading-ui.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  path.join(here, "../components/loading/loading-region.tsx"),
  "utf8",
);

test("the long wait says the screen will open, not that it failed", () => {
  assert.match(source, /Всё ещё считаем/u);
  assert.match(source, /откроется сам/u);
  for (const phrase of [/Не удалось/u, /ошибк/iu, /Повторить/u, /lp-danger/u]) {
    assert.doesNotMatch(source, phrase);
  }
});

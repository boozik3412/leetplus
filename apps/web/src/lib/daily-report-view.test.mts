import assert from "node:assert/strict";
import test from "node:test";
import { parseTelegramHtml } from "./daily-report-view.ts";

test("keeps only bold and italic formatting and decodes escaped text", () => {
  assert.deepEqual(
    parseTelegramHtml(
      "<b>Клуб &lt;1337&gt;</b>\nкасса <i>45 300 ₽</i> <script>",
    ),
    [
      { text: "Клуб <1337>", bold: true, italic: false },
      { text: "\nкасса ", bold: false, italic: false },
      { text: "45 300 ₽", bold: false, italic: true },
      { text: " <script>", bold: false, italic: false },
    ],
  );
});

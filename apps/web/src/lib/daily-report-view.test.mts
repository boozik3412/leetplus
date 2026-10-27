import assert from "node:assert/strict";
import test from "node:test";
import { parseTelegramHtml } from "./daily-report-view.ts";

test("keeps only bold and italic formatting and decodes escaped text", () => {
  assert.deepEqual(
    parseTelegramHtml(
      "<b>Клуб &lt;1337&gt;</b>\nкасса <i>45 300 ₽</i> <script>",
    ),
    [
      { text: "Клуб <1337>", bold: true, italic: false, quote: false },
      { text: "\nкасса ", bold: false, italic: false, quote: false },
      { text: "45 300 ₽", bold: false, italic: true, quote: false },
      { text: " <script>", bold: false, italic: false, quote: false },
    ],
  );
});

test("marks the text of a collapsed quote", () => {
  assert.deepEqual(
    parseTelegramHtml(
      "Смены\n<blockquote expandable><b>🚫 Закончились (1)</b>\nBURN</blockquote>",
    ),
    [
      { text: "Смены\n", bold: false, italic: false, quote: false },
      { text: "🚫 Закончились (1)", bold: true, italic: false, quote: true },
      { text: "\nBURN", bold: false, italic: false, quote: true },
    ],
  );
});

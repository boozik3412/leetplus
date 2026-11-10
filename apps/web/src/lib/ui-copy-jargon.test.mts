// Keeps service words out of the copy that club staff read.
//
// The rule and the glossary live in docs/agent-context/ui-ux.md («Язык
// интерфейса»). This test scans the visible text of the web screens (JSX text,
// visible props such as `label`/`title`/`placeholder`, and Russian string
// literals) and compares the number of each service word with
// `ui-copy-jargon.baseline.json` (kept per file to show where words are).
//
// - A new service word fails: say it in the user's words instead. Moving code
//   between files keeps the totals and passes.
// - Removing one also fails until the baseline is lowered, so the count only
//   goes down. Rewrite the baseline with
//   `UPDATE_UI_COPY_BASELINE=1 pnpm --filter web test:ui-copy`.
// - Platform administration (`/administration`) is exempt. Inside a
//   «Диагностика» block, put `ui-copy-allow` in a comment on the same or the
//   previous line.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type JargonTerm = { id: string; pattern: RegExp; say: string };

const L = "[\\p{L}\\p{N}]";
function word(source: string): RegExp {
  return new RegExp(`(?<!${L})(?:${source})`, "iu");
}

// Order matters only for readability; each term is counted on its own.
export const JARGON_TERMS: JargonTerm[] = [
  {
    id: "guest-game-hub",
    pattern: word("guest game hub"),
    say: "«Игровой модуль»",
  },
  {
    id: "snapshot",
    pattern: word("snapshot|снапшот|снепшот"),
    say: "«расчёт за период» или «данные на <дату>»",
  },
  { id: "ledger", pattern: word("ledger|леджер"), say: "«журнал начислений»" },
  {
    id: "dry-run",
    pattern: word("dry[- ]?run"),
    say: "«проверка без начисления»",
  },
  {
    id: "endpoint",
    pattern: word("endpoint|эндпоинт"),
    say: "«подключение» или «адрес сервиса»",
  },
  {
    id: "api",
    pattern: word("api(?!" + L + ")"),
    say: "«подключение», «ключ доступа Langame»",
  },
  { id: "canary", pattern: word("canary|канар"), say: "«пробный запуск»" },
  { id: "dispatch", pattern: word("dispatch"), say: "«отправка»" },
  {
    id: "materializer",
    pattern: word("materiali[sz]|материализ"),
    say: "«выдача наград»",
  },
  {
    id: "dead-letter",
    pattern: word("dead[- ]?letter"),
    say: "«не удалось обработать»",
  },
  {
    id: "lease",
    pattern: word("lease(?!" + L + ")"),
    say: "«в работе у другого процесса» — лучше не показывать",
  },
  {
    id: "idempotency",
    pattern: word("idempoten|идемпотент"),
    say: "«повтор не начислит дважды»",
  },
  {
    id: "tenant",
    pattern: word("tenant|тенант"),
    say: "«сеть» или «компания»",
  },
  {
    id: "anti-fraud",
    pattern: word("anti-?fraud|антифрод"),
    say: "«защита от накруток»",
  },
  { id: "batch", pattern: word("batch|батч"), say: "«пакет» или «партия»" },
  { id: "payload", pattern: word("payload|пейлоад"), say: "«данные»" },
  {
    id: "worker",
    pattern: word("worker(?!" + L + ")|воркер"),
    say: "«фоновая обработка»",
  },
  { id: "runtime", pattern: word("runtime|рантайм"), say: "не показывать" },
  {
    id: "backfill",
    pattern: word("backfill|бэкфил"),
    say: "«догрузка за прошлые дни»",
  },
  {
    id: "fallback",
    pattern: word("fallback|фолл?б[эе]к"),
    say: "«запасной вариант»",
  },
  { id: "retry", pattern: word("retry|ретра"), say: "«повторить»" },
  {
    id: "webhook",
    pattern: word("webhook|вебхук"),
    say: "«уведомление от сервиса»",
  },
  {
    id: "cron",
    pattern: word("cron(?!" + L + ")|scheduler"),
    say: "«по расписанию»",
  },
  { id: "capability", pattern: word("capabilit"), say: "«право доступа»" },
  {
    id: "scope",
    pattern: word("scope(?!" + L + ")|скоуп"),
    say: "«доступ к клубам»",
  },
  {
    id: "infrastructure",
    pattern: word("prisma|postgres|redis|jwt(?!" + L + ")|bff(?!" + L + ")"),
    say: "не показывать",
  },
  { id: "deploy", pattern: word("deploy|деплой"), say: "«обновление»" },
  { id: "club-days", pattern: word("клубо-?дн"), say: "«дни по клубам»" },
  { id: "lootbox", pattern: word("lootbox|лутбокс"), say: "«Кейсы» / «кейс»" },
  {
    id: "promo-scenario",
    pattern: word("промо-?сценари"),
    say: "«Акции» / «акция»",
  },
];

const VISIBLE_PROPS = new Set([
  "alt",
  "aria-label",
  "body",
  "caption",
  "confirmLabel",
  "description",
  "emptyText",
  "emptyTitle",
  "heading",
  "helper",
  "hint",
  "label",
  "message",
  "placeholder",
  "subtitle",
  "text",
  "title",
  "tooltip",
]);

const CYRILLIC = /\p{Script=Cyrillic}/u;
const ALLOW_MARKER = "ui-copy-allow";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = path.join(SRC, "lib", "ui-copy-jargon.baseline.json");

// Platform administration speaks to the LeetPlus team, not to club staff;
// API route handlers are not screens.
const EXCLUDED = [
  "app/api/",
  "app/(app)/administration/",
  "app/(app)/admin/",
  "components/platform-administration-workspace.tsx",
  "components/platform-network-panels.tsx",
];

function listScreenFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".tsx")) {
        out.push(path.relative(SRC, full).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(SRC, "app"));
  walk(path.join(SRC, "components"));
  return out
    .filter((file) => !EXCLUDED.some((prefix) => file.startsWith(prefix)))
    .sort();
}

function propName(name: ts.PropertyName | ts.JsxAttributeName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isJsxNamespacedName(name)) return null;
  return null;
}

/** Visible strings of one .tsx file, each with its 1-based line. */
export function visibleStrings(
  source: string,
  fileName = "file.tsx",
): { line: number; text: string }[] {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const lines = source.split("\n");
  const found: { line: number; text: string }[] = [];

  const allowed = (line: number) =>
    lines[line - 1]?.includes(ALLOW_MARKER) ||
    lines[line - 2]?.includes(ALLOW_MARKER);

  const push = (node: ts.Node, text: string) => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (allowed(line)) return;
    found.push({ line, text: trimmed });
  };

  const inVisibleSlot = (node: ts.Node): boolean => {
    let current: ts.Node = node;
    let parent = node.parent;
    // Walk out of `a ? "x" : "y"`, `a ?? "x"`, `("x")` and `{"x"}`.
    while (
      parent &&
      (ts.isConditionalExpression(parent) ||
        ts.isParenthesizedExpression(parent) ||
        (ts.isBinaryExpression(parent) &&
          [
            ts.SyntaxKind.QuestionQuestionToken,
            ts.SyntaxKind.BarBarToken,
            ts.SyntaxKind.AmpersandAmpersandToken,
          ].includes(parent.operatorToken.kind)))
    ) {
      current = parent;
      parent = parent.parent;
    }
    if (!parent) return false;
    if (ts.isJsxExpression(parent)) {
      const holder = parent.parent;
      if (holder && (ts.isJsxElement(holder) || ts.isJsxFragment(holder)))
        return true;
      if (holder && ts.isJsxAttribute(holder)) {
        const name = propName(holder.name);
        return name !== null && VISIBLE_PROPS.has(name);
      }
      return false;
    }
    if (ts.isJsxAttribute(parent)) {
      const name = propName(parent.name);
      return name !== null && VISIBLE_PROPS.has(name);
    }
    if (ts.isPropertyAssignment(parent) && parent.initializer === current) {
      const name = propName(parent.name);
      return name !== null && VISIBLE_PROPS.has(name);
    }
    return false;
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      push(node, node.text);
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      // Imports, `className`, keys and routes are Latin; Russian text or a
      // string in a visible slot is copy.
      if (
        !ts.isImportDeclaration(node.parent) &&
        !ts.isExportDeclaration(node.parent)
      ) {
        if (CYRILLIC.test(node.text) || inVisibleSlot(node))
          push(node, node.text);
      }
    } else if (ts.isTemplateExpression(node)) {
      const parts = [
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      ].join(" … ");
      if (CYRILLIC.test(parts) || inVisibleSlot(node)) push(node, parts);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

type Hit = { term: string; line: number; text: string };

export function jargonHits(source: string, fileName?: string): Hit[] {
  const hits: Hit[] = [];
  for (const { line, text } of visibleStrings(source, fileName)) {
    for (const term of JARGON_TERMS) {
      if (term.pattern.test(text)) hits.push({ term: term.id, line, text });
    }
  }
  return hits;
}

type Counts = Record<string, Record<string, number>>;

function scanAll(): { counts: Counts; hits: Map<string, Hit[]> } {
  const counts: Counts = {};
  const hits = new Map<string, Hit[]>();
  for (const file of listScreenFiles()) {
    const fileHits = jargonHits(
      readFileSync(path.join(SRC, file), "utf8"),
      file,
    );
    if (fileHits.length === 0) continue;
    hits.set(file, fileHits);
    const perTerm: Record<string, number> = {};
    for (const hit of fileHits)
      perTerm[hit.term] = (perTerm[hit.term] ?? 0) + 1;
    counts[file] = Object.fromEntries(
      Object.entries(perTerm).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return { counts, hits };
}

test("the scanner reads visible copy and ignores code", () => {
  const source = [
    'import { snapshotApi } from "@/lib/snapshot";',
    "const KEY = 'ledger-key';",
    'const columns = [{ key: "snapshot", label: "Snapshot за день" }];',
    "export function X({ on }: { on: boolean }) {",
    "  return (",
    '    <section className="dry-run" title={on ? "Dry-run" : "Готово"}>',
    "      Guest Game Hub",
    '      <p>{on ? "Ledger пуст" : "Журнал пуст"}</p>',
    "      {/* ui-copy-allow: диагностика */}",
    "      <code>endpoint</code>",
    "      <p>Тапы по клубо-дням и капитализм API-ключа</p>",
    "    </section>",
    "  );",
    "}",
  ].join("\n");
  const hits = jargonHits(source).map((hit) => `${hit.line}:${hit.term}`);
  assert.deepEqual(hits, [
    "3:snapshot",
    "6:dry-run",
    "7:guest-game-hub",
    "8:ledger",
    "11:api",
    "11:club-days",
  ]);
});

test("terms match whole word starts, not parts of other words", () => {
  const term = (id: string) =>
    JARGON_TERMS.find((entry) => entry.id === id)!.pattern;
  assert.equal(term("api").test("Ключ API"), true);
  assert.equal(term("api").test("Rapid"), false);
  assert.equal(term("api").test("капитал"), false);
  assert.equal(term("lease").test("please"), false);
  assert.equal(term("scope").test("Microscope"), false);
  assert.equal(term("retry").test("Ретрай"), true);
  assert.equal(term("lootbox").test("Лутбоксы"), true);
  assert.equal(term("promo-scenario").test("Промо-сценарии"), true);
});

test("screens do not gain service words (the count per word only goes down)", () => {
  const { counts, hits } = scanAll();
  if (process.env.UPDATE_UI_COPY_BASELINE === "1") {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`);
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Counts;
  const say = new Map(JARGON_TERMS.map((term) => [term.id, term.say]));

  // Compare totals per word, so moving code between files (the panel split)
  // does not fail; the per-file baseline only points at where a word grew.
  const totals = (source: Counts) => {
    const out = new Map<string, number>();
    for (const perTerm of Object.values(source)) {
      for (const [term, count] of Object.entries(perTerm)) {
        out.set(term, (out.get(term) ?? 0) + count);
      }
    }
    return out;
  };
  const was = totals(baseline);
  const now = totals(counts);

  const grew: string[] = [];
  const shrank: string[] = [];
  for (const term of [...new Set([...was.keys(), ...now.keys()])].sort()) {
    const before = was.get(term) ?? 0;
    const after = now.get(term) ?? 0;
    if (after > before) {
      const examples = [...hits.entries()]
        .filter(([file]) => {
          const inFile = (hits.get(file) ?? []).filter(
            (hit) => hit.term === term,
          ).length;
          return inFile > (baseline[file]?.[term] ?? 0);
        })
        .flatMap(([file, fileHits]) =>
          fileHits
            .filter((hit) => hit.term === term)
            .map((hit) => `    ${file}:${hit.line}  ${hit.text.slice(0, 120)}`),
        )
        .join("\n");
      grew.push(
        `  "${term}" ${before} → ${after}; пишите ${say.get(term)}\n${examples}`,
      );
    } else if (after < before) {
      shrank.push(`  "${term}" ${before} → ${after}`);
    }
  }

  const total = [...now.values()].reduce((a, b) => a + b, 0);
  console.log(
    `ui-copy: ${total} service words in ${Object.keys(counts).length} files`,
  );

  assert.equal(
    grew.length,
    0,
    `New service words on screens (see «Язык интерфейса» in docs/agent-context/ui-ux.md):\n${grew.join("\n")}`,
  );
  assert.equal(
    shrank.length,
    0,
    `Service words removed — lower the baseline with UPDATE_UI_COPY_BASELINE=1 pnpm --filter web test:ui-copy:\n${shrank.join("\n")}`,
  );
});

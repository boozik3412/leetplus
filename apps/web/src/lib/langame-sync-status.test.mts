import assert from "node:assert/strict";
import test from "node:test";
import {
  isLangameSyncLimitedMessage,
  langameSyncCompletionMessage,
  langameSyncComponentLabel,
  langameSyncMessage,
  langameSyncStepStatusLabel,
  langameSyncStatusLabel,
} from "./langame-sync-status.ts";

test("shows sections without API key access as a note on a complete import", () => {
  const message =
    "LANGAME_SYNC_LIMITED: Категории товаров: Langame не предоставил доступ к этому разделу.";
  assert.equal(isLangameSyncLimitedMessage(message), true);
  assert.equal(
    isLangameSyncLimitedMessage("LANGAME_SYNC_PARTIAL: Остатки"),
    false,
  );
  assert.equal(isLangameSyncLimitedMessage(null), false);
  assert.equal(
    langameSyncMessage(message),
    "Категории товаров: Langame не предоставил доступ к этому разделу.",
  );
  assert.equal(
    langameSyncStepStatusLabel({ status: "FAILED", count: 0, limited: true }),
    "нет доступа по ключу API",
  );
});

test("labels partial Langame sync without implying an audit-only failure", () => {
  assert.equal(langameSyncStatusLabel("PARTIAL"), "Частично");
  assert.equal(langameSyncComponentLabel("CATEGORIES"), "Категории");
  assert.equal(
    langameSyncMessage(
      "LANGAME_SYNC_PARTIAL: Категории: Langame не разрешил доступ.",
    ),
    "Категории: Langame не разрешил доступ.",
  );
  assert.equal(
    langameSyncMessage("LANGAME_DISCREPANCY_AUDIT_WRITE_FAILED: EACCES"),
    "Данные загружены, но файл расхождений не записан: EACCES",
  );
  assert.equal(
    langameSyncStepStatusLabel({ status: "FAILED", count: 1 }),
    "частично",
  );
  assert.equal(
    langameSyncStepStatusLabel({ status: "FAILED", count: 0 }),
    "не загружено",
  );
});

test("withholds a full-success message when sources are partial or failed", () => {
  assert.match(
    langameSyncCompletionMessage({ failedSources: 0, partialSources: 1 }) ?? "",
    /частично/u,
  );
  assert.match(
    langameSyncCompletionMessage({ failedSources: 1, partialSources: 0 }) ?? "",
    /уже сохранённые данные не удалены/u,
  );
  assert.equal(
    langameSyncCompletionMessage({ failedSources: 0, partialSources: 0 }),
    null,
  );
});

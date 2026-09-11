import assert from "node:assert/strict";
import test from "node:test";
import {
  langameSyncCompletionMessage,
  langameSyncComponentLabel,
  langameSyncMessage,
  langameSyncStepStatusLabel,
  langameSyncStatusLabel,
} from "./langame-sync-status.ts";

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

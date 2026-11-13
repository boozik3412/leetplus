import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTICLE_CONTENT_MAX_LENGTH,
  articleAutosaveStatus,
  articleEditMode,
  articleNextSteps,
  articlePayload,
  articleSaveErrorMessage,
  articleSaveProblem,
  canSaveArticleStatus,
  type ArticleDraft,
  type ArticleRights,
} from "./learning-article-editor.ts";

const author: ArticleRights = {
  canManage: true,
  canEdit: true,
  canReview: false,
  canPublish: false,
};
const publisher: ArticleRights = {
  canManage: true,
  canEdit: true,
  canReview: true,
  canPublish: true,
};
const reader: ArticleRights = {
  canManage: false,
  canEdit: false,
  canReview: false,
  canPublish: false,
};

function draft(overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  return {
    title: "Регламент администратора",
    summary: "",
    content: "<h2>Встреча гостя</h2><p>Здороваемся первыми.</p>",
    folder: "Регламенты",
    roleScope: "ADMINISTRATOR",
    storeId: "",
    requiresReading: true,
    ...overrides,
  };
}

test("drafts save by themselves, published articles wait for the button", () => {
  assert.equal(articleEditMode("DRAFT", author), "autosave");
  assert.equal(articleEditMode("REVIEW", author), "autosave");
  assert.equal(articleEditMode("PUBLISHED", publisher), "publish");
  assert.equal(articleEditMode("PUBLISHED", author), "read");
  assert.equal(articleEditMode("ARCHIVED", publisher), "read");
  assert.equal(articleEditMode("DRAFT", reader), "read");
});

test("an author fixing a returned article takes it back to drafts", () => {
  assert.equal(canSaveArticleStatus("RETURNED", author), false);
  assert.equal(articleEditMode("RETURNED", author), "autosave");
  assert.equal(articleAutosaveStatus("RETURNED", author), "DRAFT");
  assert.equal(articleAutosaveStatus("RETURNED", publisher), undefined);
  assert.equal(articleAutosaveStatus("DRAFT", author), undefined);
});

test("next steps follow the person's rights", () => {
  assert.deepEqual(
    articleNextSteps("DRAFT", author).map((step) => step.status),
    ["REVIEW"],
  );
  assert.deepEqual(
    articleNextSteps("DRAFT", publisher).map((step) => step.status),
    ["PUBLISHED"],
  );
  assert.deepEqual(
    articleNextSteps("REVIEW", publisher).map((step) => step.status),
    ["PUBLISHED", "RETURNED"],
  );
  assert.deepEqual(articleNextSteps("REVIEW", author), []);
  assert.deepEqual(articleNextSteps("PUBLISHED", reader), []);
});

test("save problems are worded for the editor", () => {
  assert.equal(articleSaveProblem(draft()), null);
  assert.match(articleSaveProblem(draft({ title: " " })) ?? "", /Назовите/);
  assert.equal(articleSaveProblem(draft({ content: "<p><br></p>" })), null);
  assert.match(
    articleSaveProblem(draft({ content: "<p><br></p>" }), "publish") ?? "",
    /нет текста/,
  );
  assert.match(
    articleSaveProblem(
      draft({ content: "а".repeat(ARTICLE_CONTENT_MAX_LENGTH + 1) }),
    ) ?? "",
    /разделите/,
  );
});

test("payload sends only the fields the editor owns", () => {
  const payload = articlePayload(
    draft({ title: "  Регламент ", folder: " ", summary: "  " }),
  );
  assert.deepEqual(Object.keys(payload).sort(), [
    "content",
    "folder",
    "requiresReading",
    "roleScope",
    "storeId",
    "summary",
    "title",
  ]);
  assert.equal(payload.title, "Регламент");
  assert.equal(payload.folder, "Общие");
  assert.equal(payload.summary, null);
  assert.equal(payload.storeId, null);
  assert.equal(articlePayload(draft(), "PUBLISHED").status, "PUBLISHED");
});

test("API errors are shown in Russian", () => {
  assert.match(
    articleSaveErrorMessage("Knowledge base publication is not allowed"),
    /право публикации/,
  );
  assert.equal(articleSaveErrorMessage("Статья занята"), "Статья занята");
  assert.match(articleSaveErrorMessage(undefined), /Не удалось/);
});

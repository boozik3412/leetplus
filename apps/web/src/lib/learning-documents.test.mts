import assert from "node:assert/strict";
import test from "node:test";
import {
  articleToLearningDocument,
  buildLearningDocuments,
  contentToThumbnailBlocks,
  countLearningDocuments,
  courseToLearningDocument,
  filterLearningDocuments,
  learningTemplates,
  type LearningArticleInput,
  type LearningCourseInput,
} from "./learning-documents.ts";

function course(overrides: Partial<LearningCourseInput> = {}): LearningCourseInput {
  return {
    id: "course-1",
    title: "Онбординг администратора",
    description: "Всё для первой недели",
    roleScope: "ADMINISTRATOR",
    status: "ACTIVE",
    required: true,
    steps: [
      { title: "Добро пожаловать", type: "TEXT", content: "Привет" },
      { title: "Бар", type: "TASK", content: "Продай бар" },
    ],
    updatedAt: "2026-11-12T10:00:00.000Z",
    ...overrides,
  };
}

function article(
  overrides: Partial<LearningArticleInput> = {},
): LearningArticleInput {
  return {
    id: "article-1",
    kind: "ARTICLE",
    title: "Регламент работы администратора",
    summary: "Как работаем",
    content: "<h2>1. Встреча гостя</h2><p>Здороваемся&nbsp;первыми.</p>",
    folder: "Регламенты",
    roleScope: "ADMINISTRATOR",
    status: "PUBLISHED",
    requiresReading: true,
    updatedAt: "2026-11-11T10:00:00.000Z",
    revisionDueAt: null,
    readingSummary: {
      requiredCount: 18,
      readCount: 15,
      requiredByMe: false,
      readByMe: false,
    },
    ...overrides,
  };
}

test("thumbnail reads headings, paragraphs and items from article HTML", () => {
  assert.deepEqual(
    contentToThumbnailBlocks(
      "<h2>Открытие</h2><p>Прими&nbsp;зал</p><ul><li>Касса</li><li><b>Бар</b></li></ul><img src=x onerror=alert(1)>",
    ),
    [
      { kind: "heading", text: "Открытие" },
      { kind: "paragraph", text: "Прими зал" },
      { kind: "item", text: "Касса" },
      { kind: "item", text: "Бар" },
    ],
  );
});

test("thumbnail reads the light markdown of the old editor", () => {
  assert.deepEqual(
    contentToThumbnailBlocks("# Заголовок\n\n- **пункт**\nобычный [текст](https://x)"),
    [
      { kind: "heading", text: "Заголовок" },
      { kind: "item", text: "пункт" },
      { kind: "paragraph", text: "обычный текст" },
    ],
  );
  assert.deepEqual(contentToThumbnailBlocks(null), []);
});

test("a course becomes a document with tabs, a task and its audience", () => {
  const document = courseToLearningDocument(course());

  assert.equal(document.kind, "COURSE");
  assert.equal(document.href, "/staff/learning/courses/course-1");
  assert.match(document.meta, /^Курс · 2 вкладки · /);
  assert.equal(document.note, "Администраторы");
  assert.deepEqual(document.badge, { label: "Обязательный", tone: "green" });
  assert.deepEqual(document.thumbnail[1], {
    kind: "tabs",
    text: "1 Добро пожаловать · 2 Бар",
  });
  assert.ok(document.thumbnail.some((block) => block.kind === "task"));
  assert.equal(
    courseToLearningDocument(course({ status: "DRAFT" })).badge?.label,
    "Черновик",
  );
  assert.match(
    courseToLearningDocument(course({ steps: [course().steps[0]] })).meta,
    /1 вкладка/,
  );
});

test("an article shows reading progress and asks me to read it", () => {
  const read = articleToLearningDocument(article());
  assert.equal(read.note, "Прочитали 15 из 18");
  assert.match(read.meta, /^Регламенты · /);
  assert.equal(read.requiredForMe, false);
  assert.equal(read.badge, null);

  const toRead = articleToLearningDocument(
    article({
      readingSummary: {
        requiredCount: 18,
        readCount: 15,
        requiredByMe: true,
        readByMe: false,
      },
    }),
  );
  assert.equal(toRead.requiredForMe, true);
  assert.deepEqual(toRead.badge, { label: "Прочитать", tone: "amber" });
  assert.equal(toRead.noteTone, "attention");

  const stale = articleToLearningDocument(
    article({ revisionDueAt: "2026-01-01T00:00:00.000Z" }),
    new Date("2026-11-13T00:00:00.000Z"),
  );
  assert.equal(stale.badge?.label, "Пора обновить");
});

test("recent documents mix courses and articles newest first and filter", () => {
  const documents = buildLearningDocuments(
    [course(), course({ id: "course-2", status: "DRAFT", updatedAt: "2026-10-01T00:00:00.000Z" })],
    [
      article({
        id: "article-2",
        updatedAt: "2026-11-13T00:00:00.000Z",
        readingSummary: {
          requiredCount: 1,
          readCount: 0,
          requiredByMe: true,
          readByMe: false,
        },
      }),
    ],
  );

  assert.deepEqual(
    documents.map((document) => document.id),
    ["article-2", "course-1", "course-2"],
  );
  assert.deepEqual(countLearningDocuments(documents), {
    all: 3,
    courses: 2,
    articles: 1,
    drafts: 1,
    "to-read": 1,
  });
  assert.deepEqual(
    filterLearningDocuments(documents, "drafts", "").map((d) => d.id),
    ["course-2"],
  );
  assert.deepEqual(
    filterLearningDocuments(documents, "all", "РЕГЛАМЕНТ").map((d) => d.id),
    ["article-2"],
  );
  assert.deepEqual(
    filterLearningDocuments(documents, "to-read", "").map((d) => d.id),
    ["article-2"],
  );
});

test("templates create valid courses and articles", () => {
  const keys = new Set<string>();

  for (const template of learningTemplates) {
    assert.ok(!keys.has(template.key), `duplicate template ${template.key}`);
    keys.add(template.key);

    if (template.kind === "COURSE") {
      assert.ok(template.course.title.trim());
      assert.ok(template.course.steps.length > 0);
      for (const step of template.course.steps) {
        assert.ok(step.title.trim(), `${template.key}: step title`);
        assert.ok(step.content.trim(), `${template.key}: step text`);
      }
    } else {
      assert.ok(template.article.title.trim());
    }
  }

  const onboarding = learningTemplates.find(
    (template) => template.key === "course-administrator-onboarding",
  );
  assert.equal(
    onboarding?.kind === "COURSE" ? onboarding.course.steps.length : 0,
    11,
  );
});

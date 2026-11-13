import assert from "node:assert/strict";
import test from "node:test";
import {
  COURSE_TAB_CONTENT_MAX_LENGTH,
  COURSE_TABS_MAX,
  courseSaveErrorMessage,
  courseSaveProblem,
  coursePayload,
  courseTabPlainText,
  moveCourseTab,
  newCourseTab,
  type CourseDraft,
} from "./learning-course-editor.ts";

function draft(overrides: Partial<CourseDraft> = {}): CourseDraft {
  return {
    title: "Онбординг администратора",
    description: "",
    roleScope: "ADMINISTRATOR",
    status: "DRAFT",
    required: true,
    dueDays: "",
    storeId: "",
    steps: [
      {
        ...newCourseTab("TEXT", "t1"),
        title: "Добро пожаловать",
        content: "<p>Привет</p>",
      },
      {
        ...newCourseTab("TASK", "t2"),
        title: "Бар",
        content: "<p>Продай бар</p>",
      },
    ],
    ...overrides,
  };
}

test("plain text ignores markup but counts pictures", () => {
  assert.equal(courseTabPlainText("<p>&nbsp;</p><br>"), "");
  assert.equal(courseTabPlainText("<p><img src=x></p>"), "картинка");
  assert.equal(courseTabPlainText("<h2>Бар</h2><p>Кофе</p>"), "Бар Кофе");
  assert.equal(courseTabPlainText(null), "");
});

test("tabs move within bounds", () => {
  const steps = draft().steps;
  assert.deepEqual(
    moveCourseTab(steps, "t2", -1).map((step) => step.id),
    ["t2", "t1"],
  );
  assert.equal(moveCourseTab(steps, "t1", -1), steps);
  assert.equal(moveCourseTab(steps, "missing", 1), steps);
});

test("a ready course has no save problem", () => {
  assert.equal(courseSaveProblem(draft()), null);
});

test("save problems point at the tab to fix", () => {
  assert.equal(courseSaveProblem(draft({ title: " " }))?.tabId, null);
  assert.match(
    courseSaveProblem(draft({ dueDays: "3.5" }))?.message ?? "",
    /от 0 до 365/,
  );

  const empty = draft();
  empty.steps[1] = { ...empty.steps[1], content: "<p><br></p>" };
  assert.deepEqual(courseSaveProblem(empty), {
    tabId: "t2",
    message: "Опишите задание во вкладке «Бар».",
  });

  const untitled = draft();
  untitled.steps[0] = { ...untitled.steps[0], title: "" };
  assert.deepEqual(courseSaveProblem(untitled), {
    tabId: "t1",
    message: "Назовите вкладку №1.",
  });

  const long = draft();
  long.steps[0] = {
    ...long.steps[0],
    content: `<p>${"а".repeat(COURSE_TAB_CONTENT_MAX_LENGTH)}</p>`,
  };
  assert.equal(courseSaveProblem(long)?.tabId, "t1");

  const article = draft({ steps: [newCourseTab("ARTICLE", "a1")] });
  assert.match(courseSaveProblem(article)?.message ?? "", /Выберите статью/);

  const link = draft({
    steps: [{ ...newCourseTab("LINK", "l1"), url: "ftp://x" }],
  });
  assert.match(courseSaveProblem(link)?.message ?? "", /https:\/\//);
  link.steps[0] = { ...link.steps[0], url: "https://youtu.be/x" };
  assert.equal(courseSaveProblem(link), null);

  const many = draft({
    steps: Array.from({ length: COURSE_TABS_MAX + 1 }, (_, index) => ({
      ...newCourseTab("TEXT", `s${index}`),
      content: "текст",
    })),
  });
  assert.match(courseSaveProblem(many)?.message ?? "", /не больше 40/);
});

test("payload keeps only fields that belong to each tab type", () => {
  const payload = coursePayload(
    draft({
      title: "  Курс  ",
      dueDays: " 14 ",
      steps: [
        {
          ...newCourseTab("ARTICLE", "a1"),
          articleId: "article-1",
          content: "лишнее",
          url: "https://x",
        },
        {
          ...newCourseTab("LINK", "l1"),
          url: " https://youtu.be/x ",
          content: "  смотреть до конца ",
          articleId: "article-2",
        },
      ],
    }),
  );

  assert.equal(payload.title, "Курс");
  assert.equal(payload.dueDays, "14");
  assert.equal(payload.description, null);
  assert.equal(payload.storeId, null);
  assert.deepEqual(payload.steps[0], {
    id: "a1",
    title: "Статья из базы знаний",
    type: "ARTICLE",
    articleId: "article-1",
    content: null,
    url: null,
    required: true,
  });
  assert.equal(payload.steps[1].url, "https://youtu.be/x");
  assert.equal(payload.steps[1].content, "смотреть до конца");
  assert.equal(payload.steps[1].articleId, null);
});

test("API errors are shown in Russian", () => {
  assert.equal(
    courseSaveErrorMessage("Course step text is too long"),
    "Одна из вкладок слишком длинная: разделите её на две.",
  );
  assert.equal(
    courseSaveErrorMessage("Course step URL must start with https://"),
    "Ссылка должна начинаться с https://",
  );
  assert.equal(courseSaveErrorMessage("Курс не найден"), "Курс не найден");
  assert.match(courseSaveErrorMessage("Internal server error"), /Не удалось/);
  assert.match(courseSaveErrorMessage(null), /Не удалось/);
});

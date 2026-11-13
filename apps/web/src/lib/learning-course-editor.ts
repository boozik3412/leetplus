// Pure pieces of the course editor in «Обучение и база знаний»: a course is
// a document whose tabs are its steps. Shared by the editor and its tests.

import type { LearningRoleScope } from "./learning-documents.ts";

export type CourseTabType = "TEXT" | "TASK" | "ARTICLE" | "LINK";

export type CourseTab = {
  id: string;
  title: string;
  type: CourseTabType;
  articleId: string | null;
  content: string | null;
  url: string | null;
  required: boolean;
};

export type CourseDraft = {
  title: string;
  description: string;
  roleScope: LearningRoleScope;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  required: boolean;
  dueDays: string;
  storeId: string;
  steps: CourseTab[];
};

export const COURSE_TAB_CONTENT_MAX_LENGTH = 60000;
export const COURSE_TABS_MAX = 40;

export const courseTabTypeLabels: Record<CourseTabType, string> = {
  TEXT: "Страница",
  TASK: "Задание",
  ARTICLE: "Статья из базы знаний",
  LINK: "Ссылка",
};

export const courseTabTypeHints: Record<CourseTabType, string> = {
  TEXT: "текст, списки, картинки",
  TASK: "наставник отмечает выполнение",
  ARTICLE: "вставить целиком, правится в базе",
  LINK: "видео или внешний материал",
};

export const courseStatusLabels: Record<CourseDraft["status"], string> = {
  DRAFT: "Черновик",
  ACTIVE: "Опубликован",
  ARCHIVED: "В архиве",
};

/** Plain text of a tab's content, to tell an empty page from a written one. */
export function courseTabPlainText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<img\b[^>]*>/gi, " картинка ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function newCourseTab(type: CourseTabType, id: string): CourseTab {
  return {
    id,
    title:
      type === "TASK"
        ? "Новое задание"
        : type === "ARTICLE"
          ? "Статья из базы знаний"
          : type === "LINK"
            ? "Ссылка"
            : "Новая вкладка",
    type,
    articleId: null,
    content: null,
    url: null,
    required: true,
  };
}

export function moveCourseTab(
  steps: CourseTab[],
  id: string,
  direction: -1 | 1,
): CourseTab[] {
  const index = steps.findIndex((step) => step.id === id);
  const target = index + direction;

  if (index === -1 || target < 0 || target >= steps.length) {
    return steps;
  }

  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function isAllowedUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

/**
 * The first reason the course cannot be saved yet, worded for the person
 * editing it, or null. Mirrors the API rules so autosave never sends a
 * course the server refuses.
 */
export function courseSaveProblem(draft: CourseDraft): {
  tabId: string | null;
  message: string;
} | null {
  if (!draft.title.trim()) {
    return { tabId: null, message: "Назовите курс — название вверху слева." };
  }

  if (draft.dueDays.trim()) {
    const days = Number(draft.dueDays);

    if (!Number.isInteger(days) || days < 0 || days > 365) {
      return {
        tabId: null,
        message: "Срок прохождения — целое число дней от 0 до 365.",
      };
    }
  }

  if (draft.steps.length > COURSE_TABS_MAX) {
    return {
      tabId: null,
      message: `В курсе может быть не больше ${COURSE_TABS_MAX} вкладок.`,
    };
  }

  for (const [index, step] of draft.steps.entries()) {
    const name = step.title.trim()
      ? `«${step.title.trim()}»`
      : `№${index + 1}`;

    if (!step.title.trim()) {
      return { tabId: step.id, message: `Назовите вкладку ${name}.` };
    }

    if (
      (step.type === "TEXT" || step.type === "TASK") &&
      !courseTabPlainText(step.content)
    ) {
      return {
        tabId: step.id,
        message:
          step.type === "TASK"
            ? `Опишите задание во вкладке ${name}.`
            : `Во вкладке ${name} пока нет текста.`,
      };
    }

    if (
      (step.content ?? "").length > COURSE_TAB_CONTENT_MAX_LENGTH
    ) {
      return {
        tabId: step.id,
        message: `Вкладка ${name} слишком длинная: разделите её на две.`,
      };
    }

    if (step.type === "ARTICLE" && !step.articleId) {
      return {
        tabId: step.id,
        message: `Выберите статью для вкладки ${name}.`,
      };
    }

    if (step.type === "LINK") {
      const url = step.url?.trim() ?? "";

      if (!url) {
        return { tabId: step.id, message: `Вставьте ссылку во вкладку ${name}.` };
      }

      if (!isAllowedUrl(url)) {
        return {
          tabId: step.id,
          message: `Ссылка во вкладке ${name} должна начинаться с https://`,
        };
      }
    }
  }

  return null;
}

/** Body of PATCH /staff/training-courses/:id. */
export function coursePayload(draft: CourseDraft) {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    roleScope: draft.roleScope,
    status: draft.status,
    required: draft.required,
    dueDays: draft.dueDays.trim() || null,
    storeId: draft.storeId || null,
    steps: draft.steps.map((step) => ({
      id: step.id,
      title: step.title.trim(),
      type: step.type,
      articleId: step.type === "ARTICLE" ? step.articleId : null,
      content:
        step.type === "TEXT" || step.type === "TASK" || step.type === "LINK"
          ? step.content?.trim() || null
          : null,
      url: step.type === "LINK" ? step.url?.trim() || null : null,
      required: step.required,
    })),
  };
}

/** API error texts are English; say the same thing in the editor's words. */
export function courseSaveErrorMessage(message: string | null | undefined) {
  const known: Record<string, string> = {
    "Course step title is required": "У одной из вкладок нет названия.",
    "Course step article is required": "Выберите статью во вкладке-статье.",
    "Knowledge article not found":
      "Статья для вкладки не найдена или недоступна для вашего клуба.",
    "Course step URL is required": "Во вкладке-ссылке нет адреса.",
    "Course step text is required": "Одна из вкладок пустая.",
    "Course step text is too long":
      "Одна из вкладок слишком длинная: разделите её на две.",
    "Due days must be between 0 and 365":
      "Срок прохождения — от 0 до 365 дней.",
    "Store not found": "Клуб не найден или недоступен.",
  };

  if (message && known[message]) {
    return known[message];
  }

  if (message && message.startsWith("Course step URL must")) {
    return "Ссылка должна начинаться с https://";
  }

  return message && /[а-яё]/i.test(message)
    ? message
    : "Не удалось сохранить. Повторим при следующем изменении.";
}

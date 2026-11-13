// Pure pieces of the article editor in «Обучение и база знаний»: an article
// of the knowledge base opened as one document. Shared by the editor and its
// tests.

import type { LearningRoleScope } from "./learning-documents.ts";

export type ArticleStatus =
  | "DRAFT"
  | "REVIEW"
  | "RETURNED"
  | "PUBLISHED"
  | "ARCHIVED";

export type ArticleDraft = {
  title: string;
  summary: string;
  content: string;
  folder: string;
  roleScope: LearningRoleScope;
  storeId: string;
  requiresReading: boolean;
};

export type ArticleRights = {
  canManage: boolean;
  canEdit: boolean;
  canReview: boolean;
  canPublish: boolean;
};

/**
 * How the editor treats changes:
 * - autosave: a draft, an article on review or returned for rework. Saving
 *   does not create a version, so every pause is saved like in Docs.
 * - publish: a published article. Each save is a new version and asks
 *   everybody who must read it to read again, so changes wait for the
 *   «Опубликовать изменения» button.
 * - read: no right to change this article in its current state.
 */
export type ArticleEditMode = "autosave" | "publish" | "read";

export const ARTICLE_TITLE_MAX_LENGTH = 180;
export const ARTICLE_SUMMARY_MAX_LENGTH = 500;
export const ARTICLE_CONTENT_MAX_LENGTH = 2_000_000;

export const articleStatusLabels: Record<ArticleStatus, string> = {
  DRAFT: "Черновик",
  REVIEW: "На согласовании",
  RETURNED: "На доработке",
  PUBLISHED: "Опубликована",
  ARCHIVED: "В архиве",
};

/** Mirrors the API: which statuses this person may save an article in. */
export function canSaveArticleStatus(
  status: ArticleStatus,
  rights: ArticleRights,
) {
  if (!rights.canManage) {
    return false;
  }

  if (status === "PUBLISHED" || status === "ARCHIVED") {
    return rights.canPublish;
  }

  if (status === "RETURNED") {
    return rights.canReview;
  }

  return rights.canEdit || rights.canReview;
}

export function articleEditMode(
  status: ArticleStatus,
  rights: ArticleRights,
): ArticleEditMode {
  if (!rights.canManage || status === "ARCHIVED") {
    return "read";
  }

  if (status === "PUBLISHED") {
    return rights.canPublish ? "publish" : "read";
  }

  if (canSaveArticleStatus(status, rights)) {
    return "autosave";
  }

  // An author fixing an article returned for rework takes it back to drafts.
  return status === "RETURNED" && rights.canEdit ? "autosave" : "read";
}

/** Status an autosave sends, or undefined to keep the current one. */
export function articleAutosaveStatus(
  status: ArticleStatus,
  rights: ArticleRights,
): ArticleStatus | undefined {
  return status === "RETURNED" && !rights.canReview && rights.canEdit
    ? "DRAFT"
    : undefined;
}

/** Status buttons the person may press next, in the order they are shown. */
export function articleNextSteps(
  status: ArticleStatus,
  rights: ArticleRights,
): Array<{ status: ArticleStatus; label: string; primary: boolean }> {
  if (!rights.canManage) {
    return [];
  }

  const steps: Array<{
    status: ArticleStatus;
    label: string;
    primary: boolean;
  }> = [];

  if (status === "DRAFT" || status === "RETURNED") {
    if (rights.canPublish) {
      steps.push({ status: "PUBLISHED", label: "Опубликовать", primary: true });
    } else if (rights.canEdit || rights.canReview) {
      steps.push({
        status: "REVIEW",
        label: "Отправить на согласование",
        primary: true,
      });
    }
  }

  if (status === "REVIEW") {
    if (rights.canPublish) {
      steps.push({ status: "PUBLISHED", label: "Опубликовать", primary: true });
    }

    if (rights.canReview) {
      steps.push({
        status: "RETURNED",
        label: "Вернуть на доработку",
        primary: false,
      });
    }
  }

  if (status === "ARCHIVED" && rights.canPublish) {
    steps.push({
      status: "DRAFT",
      label: "Вернуть в черновики",
      primary: false,
    });
  }

  return steps;
}

/** Plain text of the body, to tell an empty page from a written one. */
export function articlePlainText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<img\b[^>]*>/gi, " картинка ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The first reason the article cannot be saved yet, worded for the person
 * editing it, or null. Publishing also needs some text.
 */
export function articleSaveProblem(
  draft: ArticleDraft,
  target: "save" | "publish" = "save",
): string | null {
  if (!draft.title.trim()) {
    return "Назовите статью — название вверху слева.";
  }

  if (draft.title.trim().length > ARTICLE_TITLE_MAX_LENGTH) {
    return `Название длиннее ${ARTICLE_TITLE_MAX_LENGTH} знаков, сократите его.`;
  }

  if (draft.summary.trim().length > ARTICLE_SUMMARY_MAX_LENGTH) {
    return `Описание длиннее ${ARTICLE_SUMMARY_MAX_LENGTH} знаков, сократите его.`;
  }

  if (draft.content.length > ARTICLE_CONTENT_MAX_LENGTH) {
    return "Статья слишком длинная: разделите её на две.";
  }

  if (target === "publish" && !articlePlainText(draft.content)) {
    return "В статье пока нет текста.";
  }

  return null;
}

/**
 * Body of PATCH /staff/knowledge-base/:id. Only the fields this editor owns:
 * materials, related links and tags stay as they are on the server.
 */
export function articlePayload(draft: ArticleDraft, status?: ArticleStatus) {
  return {
    title: draft.title.trim(),
    summary: draft.summary.trim() || null,
    content: draft.content.trim() || null,
    folder: draft.folder.trim() || "Общие",
    roleScope: draft.roleScope,
    storeId: draft.storeId || null,
    requiresReading: draft.requiresReading,
    ...(status ? { status } : {}),
  };
}

/** API error texts are English; say the same thing in the editor's words. */
export function articleSaveErrorMessage(message: string | null | undefined) {
  const known: Record<string, string> = {
    "Article title is required": "Назовите статью.",
    "Knowledge article not found":
      "Статья не найдена или недоступна для вашего клуба.",
    "Knowledge base editing is not allowed":
      "У вашей роли нет прав менять эту статью.",
    "Knowledge base publication is not allowed":
      "Публиковать статьи может только тот, у кого есть право публикации.",
    "Knowledge base review workflow is not allowed":
      "У вашей роли нет прав на согласование.",
    "Store not found": "Клуб не найден или недоступен.",
  };

  if (message && known[message]) {
    return known[message];
  }

  return message && /[а-яё]/i.test(message)
    ? message
    : "Не удалось сохранить. Повторим при следующем изменении.";
}

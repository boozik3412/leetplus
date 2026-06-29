"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  StaffAttachmentUpload,
  type StaffAttachmentUploadResult,
} from "@/components/staff-attachment-upload";
import { StaffMaterialPreview } from "@/components/staff-material-preview";
import {
  KnowledgeArticleRichText,
  StaffKnowledgeRichTextEditor,
  openKnowledgeReadingWindow,
  type KnowledgeReadingWindowData,
} from "@/components/staff-knowledge-rich-text";
import { useUnsavedDraftPrompt } from "@/hooks/use-unsaved-draft-prompt";
import type {
  StaffKnowledgeArticle,
  StaffKnowledgeArticleSuggestion,
  StaffKnowledgeArticleStatus,
  StaffKnowledgeBaseReport,
  StaffKnowledgeMaterial,
  StaffKnowledgeMaterialType,
  StaffKnowledgeRelatedLink,
  StaffKnowledgeRelatedLinkType,
  StaffKnowledgeRevisionSlaPolicy,
  StaffKnowledgeRoleScope,
  StaffKnowledgeSettingsEvent,
} from "@/lib/staff-knowledge-base";

const statusLabels: Record<StaffKnowledgeArticleStatus, string> = {
  DRAFT: "Черновик",
  REVIEW: "На согласовании",
  RETURNED: "Возвращено",
  PUBLISHED: "Опубликовано",
  ARCHIVED: "Архив",
};

const reviewQueueTabs = [
  {
    key: "REVIEW",
    label: "Ждет проверки",
    empty: "Материалов на согласовании пока нет.",
  },
  {
    key: "RETURNED",
    label: "Возвращено",
    empty: "Возвращенных на доработку материалов пока нет.",
  },
  {
    key: "PUBLISHED",
    label: "Опубликовано",
    empty: "Опубликованных материалов в текущей выборке пока нет.",
  },
] as const;

const roleScopeLabels: Record<StaffKnowledgeRoleScope, string> = {
  ALL_STAFF: "Весь персонал",
  ADMINISTRATOR: "Администраторы",
  SENIOR_ADMINISTRATOR: "Старшие администраторы",
  CLUB_MANAGER: "Управляющие клубов",
  MANAGER: "Управляющие сети",
  STANDARDS_MANAGER: "Менеджер по стандартам",
};

const materialTypeLabels: Record<StaffKnowledgeMaterialType, string> = {
  TEXT: "Текст",
  FILE_LINK: "Файл",
  IMAGE: "Изображение",
  VIDEO: "Видео",
  EXTERNAL_LINK: "Ссылка",
  OTHER: "Другое",
};

const relatedLinkTypeLabels: Record<StaffKnowledgeRelatedLinkType, string> = {
  REGULATION: "Регламент",
  CHECKLIST: "Чек-лист",
  TRAINING: "Обучение",
  ONBOARDING: "Адаптация",
  DISCIPLINE: "Нарушение",
  TASK: "Задача",
  OTHER: "Другое",
};

const revisionSlaRoleOrder: StaffKnowledgeRoleScope[] = [
  "ALL_STAFF",
  "ADMINISTRATOR",
  "SENIOR_ADMINISTRATOR",
  "CLUB_MANAGER",
  "MANAGER",
  "STANDARDS_MANAGER",
];

const revisionSlaMaterialTypeOrder: StaffKnowledgeMaterialType[] = [
  "TEXT",
  "FILE_LINK",
  "IMAGE",
  "VIDEO",
  "EXTERNAL_LINK",
  "OTHER",
];

type DraftArticle = {
  id: string | null;
  title: string;
  summary: string;
  content: string;
  folder: string;
  category: string;
  roleScope: StaffKnowledgeRoleScope;
  status: StaffKnowledgeArticleStatus;
  templateKey: string;
  requiresReading: boolean;
  revisionSlaDays: string;
  storeId: string;
  tagsText: string;
  materials: StaffKnowledgeMaterial[];
  relatedLinks: StaffKnowledgeRelatedLink[];
  approvalNote: string;
};

const seedArticles: Array<
  Omit<DraftArticle, "id" | "storeId" | "revisionSlaDays">
> = [
  {
    title: "Кассовая дисциплина смены",
    summary:
      "Что администратор проверяет по кассе, оплатам и расхождениям до передачи смены.",
    content:
      "Сверьте наличные, безналичные оплаты, возвраты, инкассацию, комментарии по спорным операциям и итог сменного отчета. Любое расхождение фиксируйте в чек-листе смены с суммой, причиной, фото или ссылкой на задачу управляющему.",
    folder: "Касса",
    category: "Касса",
    roleScope: "ADMINISTRATOR",
    status: "DRAFT",
    templateKey: "cash-discipline",
    requiresReading: true,
    tagsText: "касса, смена, инкассация, возврат",
    materials: [
      {
        id: "material-cash-evidence",
        title: "Что приложить при расхождении",
        type: "TEXT",
        url: null,
        content:
          "Сумма расхождения, тип оплаты, время операции, комментарий администратора и фото кассовой зоны или документа, если это допустимо внутренними правилами.",
        note: null,
        required: true,
      },
    ],
    relatedLinks: [
      {
        id: "link-cash-regulations",
        type: "REGULATION",
        title: "Регламенты смены",
        url: "/staff/shift-regulations",
        note: "Используйте опубликованный регламент как основной источник правил передачи кассы.",
      },
    ],
    approvalNote: "",
  },
  {
    title: "Сервис и конфликтный гость",
    summary:
      "Порядок действий, когда гость недоволен услугой, оплатой, местом или поведением другого посетителя.",
    content:
      "Сначала выслушайте гостя без спора, зафиксируйте факт, предложите понятное решение в рамках полномочий и передайте управляющему, если ситуация влияет на деньги, безопасность или репутацию клуба.",
    folder: "Сервис",
    category: "Сервис",
    roleScope: "ALL_STAFF",
    status: "DRAFT",
    templateKey: "guest-conflict",
    requiresReading: true,
    tagsText: "сервис, конфликт, гости",
    materials: [
      {
        id: "material-service-script",
        title: "Мини-скрипт разговора",
        type: "TEXT",
        url: null,
        content:
          "Признать проблему, уточнить ожидание гостя, предложить вариант решения, назвать срок и передать управляющему, если требуется компенсация или блокировка посетителя.",
        note: "Нужен как короткая подсказка для новых администраторов.",
        required: false,
      },
    ],
    relatedLinks: [
      {
        id: "link-service-task",
        type: "TASK",
        title: "Задача управляющему",
        url: "/staff/tasks",
        note: "Создайте задачу, если конфликт требует управленческого решения.",
      },
    ],
    approvalNote: "",
  },
  {
    title: "Проверка бара перед пиком",
    summary:
      "Как быстро убедиться, что бар готов к вечерней загрузке и не потеряет продажи.",
    content:
      "Проверьте наличие ходовых позиций, ценники, чистоту витрины и товары с низким остатком. По дефициту создайте задачу закупки или пополнения.",
    folder: "Бар",
    category: "Бар",
    roleScope: "SENIOR_ADMINISTRATOR",
    status: "DRAFT",
    templateKey: "bar-peak-readiness",
    requiresReading: false,
    tagsText: "бар, продажи, остатки",
    materials: [],
    relatedLinks: [
      {
        id: "link-checklist-templates",
        type: "CHECKLIST",
        title: "Шаблоны чек-листов",
        url: "/staff/checklist-templates",
        note: "Используйте как основу для проверки бара перед пиком.",
      },
    ],
    approvalNote: "",
  },
  {
    title: "Первичная техподдержка места",
    summary:
      "Как администратор проверяет ПК, периферию и посадочное место до передачи проблемы технику.",
    content:
      "Уточните номер места, симптомы, время начала проблемы, действия гостя и последние изменения. Проверьте питание, монитор, периферию, сеть, клиентскую сессию и соседние места. Если проблема не решена за несколько минут, создайте задачу с фактами и не обещайте гостю технический результат без подтверждения.",
    folder: "Техподдержка",
    category: "ПК и периферия",
    roleScope: "ADMINISTRATOR",
    status: "DRAFT",
    templateKey: "pc-first-line-support",
    requiresReading: true,
    tagsText: "техподдержка, пк, периферия, место",
    materials: [
      {
        id: "material-tech-check",
        title: "Данные для заявки",
        type: "TEXT",
        url: null,
        content:
          "Номер ПК, проблема со слов гостя, что уже проверено, фото/видео симптома и срочность: влияет ли на посадку, турнир или бронь.",
        note: null,
        required: true,
      },
    ],
    relatedLinks: [
      {
        id: "link-tech-checklist",
        type: "CHECKLIST",
        title: "Чек-лист проверки места",
        url: "/staff/checklist-templates",
        note: "Используйте как основу для регулярного обхода зала.",
      },
    ],
    approvalNote: "",
  },
  {
    title: "Профиль администратора на найме",
    summary:
      "Критерии отбора и адаптации администратора: сервис, ответственность, касса и готовность к сменной работе.",
    content:
      "Проверьте опыт работы с гостями, внимательность к деньгам и документам, спокойствие в конфликте, готовность работать по регламентам и обучаться. После собеседования зафиксируйте сильные стороны, риски, условия выхода на стажировку и первые материалы для изучения.",
    folder: "Найм",
    category: "Подбор и адаптация",
    roleScope: "STANDARDS_MANAGER",
    status: "DRAFT",
    templateKey: "administrator-hiring-profile",
    requiresReading: false,
    tagsText: "найм, адаптация, администратор, стандарты",
    materials: [
      {
        id: "material-hiring-criteria",
        title: "Критерии решения",
        type: "TEXT",
        url: null,
        content:
          "Сервисность, дисциплина, честность в кассовых вопросах, техническая базовая грамотность, обучаемость и готовность соблюдать стандарты клуба.",
        note: "Подходит для стандартизации собеседований по сети.",
        required: false,
      },
    ],
    relatedLinks: [
      {
        id: "link-onboarding",
        type: "ONBOARDING",
        title: "Маршруты адаптации",
        url: "/staff/onboarding",
        note: "После найма сотрудника можно направить в готовый onboarding plan.",
      },
    ],
    approvalNote: "",
  },
];

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultDraft(): DraftArticle {
  return {
    id: null,
    title: "",
    summary: "",
    content: "",
    folder: "Общие",
    category: "Общие стандарты",
    roleScope: "ALL_STAFF",
    status: "DRAFT",
    templateKey: "",
    requiresReading: false,
    revisionSlaDays: "",
    storeId: "",
    tagsText: "",
    materials: [],
    relatedLinks: [],
    approvalNote: "",
  };
}

function fromArticle(row: StaffKnowledgeArticle): DraftArticle {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? "",
    content: row.content ?? "",
    folder: row.folder,
    category: row.category,
    roleScope: row.roleScope,
    status: row.status,
    templateKey: row.templateKey ?? "",
    requiresReading: row.requiresReading,
    revisionSlaDays: row.revisionSlaDays?.toString() ?? "",
    storeId: row.store?.id ?? "",
    tagsText: row.tags.join(", "),
    materials: row.materials,
    relatedLinks: row.relatedLinks,
    approvalNote: row.approvalNote ?? "",
  };
}

function draftSnapshot(draft: DraftArticle) {
  return JSON.stringify(draft);
}

function tagsFromText(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function defaultRevisionSlaDays(
  roleScope: StaffKnowledgeRoleScope,
  materials: StaffKnowledgeMaterial[],
  policy: StaffKnowledgeRevisionSlaPolicy,
) {
  const materialExtraDays = materials.reduce((maxExtraDays, material) => {
    if (!material.required) {
      return maxExtraDays;
    }

    return Math.max(
      maxExtraDays,
      policy.materialTypeExtraDays[material.type] ?? 0,
    );
  }, 0);
  const roleDays = policy.roleDays[roleScope] ?? policy.defaultDays;

  return Math.min(Math.max(Math.round(roleDays + materialExtraDays), 1), 14);
}

function formatSettingsActor(
  user: StaffKnowledgeSettingsEvent["actorUser"],
) {
  return user?.fullName ?? user?.email ?? "Система";
}

function countPolicyChanges<T extends string>(
  previous: Record<T, number>,
  next: Record<T, number>,
  keys: T[],
) {
  return keys.filter((key) => previous[key] !== next[key]).length;
}

function slaPolicyHistorySummary(event: StaffKnowledgeSettingsEvent) {
  if (!event.previousRevisionSlaPolicy) {
    return `Первичная настройка: базовый срок ${event.nextRevisionSlaPolicy.defaultDays} дн.`;
  }

  const roleChanges = countPolicyChanges(
    event.previousRevisionSlaPolicy.roleDays,
    event.nextRevisionSlaPolicy.roleDays,
    revisionSlaRoleOrder,
  );
  const materialChanges = countPolicyChanges(
    event.previousRevisionSlaPolicy.materialTypeExtraDays,
    event.nextRevisionSlaPolicy.materialTypeExtraDays,
    revisionSlaMaterialTypeOrder,
  );
  const details = [
    event.previousRevisionSlaPolicy.defaultDays !==
    event.nextRevisionSlaPolicy.defaultDays
      ? `базовый срок ${event.previousRevisionSlaPolicy.defaultDays} -> ${event.nextRevisionSlaPolicy.defaultDays} дн.`
      : null,
    roleChanges > 0 ? `ролей изменено: ${roleChanges}` : null,
    materialChanges > 0 ? `материалов изменено: ${materialChanges}` : null,
  ].filter(Boolean);

  return details.length > 0 ? details.join(", ") : "Без изменения числовых правил";
}

function materialTypeFromAttachment(
  attachment: StaffAttachmentUploadResult,
): StaffKnowledgeMaterialType {
  if (attachment.contentType.startsWith("image/")) {
    return "IMAGE";
  }

  if (attachment.contentType.startsWith("video/")) {
    return "VIDEO";
  }

  return "FILE_LINK";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "не опубликовано";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function revisionSlaBadge(article: StaffKnowledgeArticle) {
  if (article.status !== "RETURNED") {
    return null;
  }

  if (!article.revisionDueAt) {
    return {
      label: "SLA не задан",
      className:
        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    };
  }

  const dueAt = new Date(article.revisionDueAt);
  const hoursLeft = Math.ceil(
    (dueAt.getTime() - Date.now()) / (60 * 60 * 1000),
  );

  if (hoursLeft < 0) {
    return {
      label: `SLA просрочен: ${formatDateTime(article.revisionDueAt)}`,
      className:
        "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200",
    };
  }

  if (hoursLeft <= 24) {
    return {
      label: `Реакция сегодня: ${formatDateTime(article.revisionDueAt)}`,
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
    };
  }

  return {
    label: `Реакция до ${formatDateTime(article.revisionDueAt)}`,
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  };
}

function RevisionSlaPill({ article }: { article: StaffKnowledgeArticle }) {
  const badge = revisionSlaBadge(article);

  if (!badge) {
    return null;
  }

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}


function readingMaterialsFrom(
  materials: StaffKnowledgeMaterial[],
): KnowledgeReadingWindowData["materials"] {
  return materials
    .filter(
      (material) =>
        material.title.trim() || material.content?.trim() || material.url?.trim(),
    )
    .map((material, index) => ({
      id: material.id || `knowledge-material-${index}`,
      title: material.title || `Материал ${index + 1}`,
      type: material.type,
      typeLabel: materialTypeLabels[material.type],
      url: material.url,
      content: material.content,
      note: material.note,
      required: material.required,
    }));
}

function readingLinksFrom(
  links: StaffKnowledgeRelatedLink[],
): KnowledgeReadingWindowData["relatedLinks"] {
  return links
    .filter((link) => link.title.trim() || link.url?.trim())
    .map((link, index) => ({
      id: link.id || `knowledge-link-${index}`,
      title: link.title || `Связь ${index + 1}`,
      typeLabel: relatedLinkTypeLabels[link.type],
      url: link.url,
      note: link.note,
    }));
}

function articleReadingData(
  article: StaffKnowledgeArticle,
): KnowledgeReadingWindowData {
  return {
    id: article.id,
    eyebrow: "База знаний",
    title: article.title,
    summary: article.summary,
    content: article.content,
    metrics: [
      { label: "Папка", value: article.folder },
      { label: "Категория", value: article.category },
      { label: "Видимость", value: roleScopeLabels[article.roleScope] },
      { label: "Клуб", value: article.store?.name ?? "Вся сеть" },
      { label: "Статус", value: statusLabels[article.status] },
      {
        label: "Прочтение",
        value: article.requiresReading ? "Обязательное" : "Необязательное",
      },
    ],
    tags: article.tags,
    materials: readingMaterialsFrom(article.materials),
    relatedLinks: readingLinksFrom(article.relatedLinks),
    reading: {
      requiresReading: article.requiresReading,
      requiredByMe: article.readingSummary.requiredByMe,
      readByMe: article.readingSummary.readByMe,
      readAt: article.readingSummary.readAt,
      readCount: article.readingSummary.readCount,
      requiredCount: article.readingSummary.requiredCount,
      pendingCount: article.readingSummary.pendingCount,
    },
  };
}

function draftReadingData(
  draft: DraftArticle,
  report: StaffKnowledgeBaseReport,
  effectiveRevisionSlaDays: number,
): KnowledgeReadingWindowData {
  return {
    id: draft.id,
    eyebrow: "Предпросмотр базы знаний",
    title: draft.title || "Новая статья",
    summary: draft.summary,
    content: draft.content,
    metrics: [
      { label: "Папка", value: draft.folder || "Общие" },
      { label: "Категория", value: draft.category || "Без категории" },
      { label: "Видимость", value: roleScopeLabels[draft.roleScope] },
      {
        label: "Клуб",
        value: draft.storeId
          ? report.stores.find((store) => store.id === draft.storeId)?.name ??
            "Клуб"
          : "Вся сеть",
      },
      { label: "Статус", value: statusLabels[draft.status] },
      {
        label: "Прочтение",
        value: draft.requiresReading ? "Обязательное" : "Необязательное",
      },
      { label: "SLA возврата", value: `${effectiveRevisionSlaDays} дн.` },
    ],
    tags: tagsFromText(draft.tagsText),
    materials: readingMaterialsFrom(draft.materials),
    relatedLinks: readingLinksFrom(draft.relatedLinks),
  };
}

export function StaffKnowledgeBaseWorkspace({
  report,
}: {
  report: StaffKnowledgeBaseReport;
}) {
  const router = useRouter();
  const [reviewQueueTab, setReviewQueueTab] =
    useState<(typeof reviewQueueTabs)[number]["key"]>("REVIEW");
  const initialDraft = report.rows[0]
    ? fromArticle(report.rows[0])
    : defaultDraft();
  const [draft, setDraft] = useState<DraftArticle>(() =>
    initialDraft,
  );
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState(() =>
    draftSnapshot(initialDraft),
  );
  const [isPending, setIsPending] = useState(false);
  const [settingsPending, setSettingsPending] = useState(false);
  const [revisionSlaPolicy, setRevisionSlaPolicy] =
    useState<StaffKnowledgeRevisionSlaPolicy>(
      report.settings.revisionSlaPolicy,
    );
  const [settingsHistory, setSettingsHistory] = useState(
    report.settings.history,
  );
  const [readPendingId, setReadPendingId] = useState<string | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedArticle = useMemo(
    () => report.rows.find((row) => row.id === draft.id) ?? null,
    [draft.id, report.rows],
  );
  const canSaveArticle =
    report.canEditKnowledge ||
    report.canReviewKnowledge ||
    report.canPublishKnowledge;
  function canSaveStatus(status: StaffKnowledgeArticleStatus) {
    if (status === "PUBLISHED" || status === "ARCHIVED") {
      return report.canPublishKnowledge;
    }

    if (status === "RETURNED") {
      return report.canReviewKnowledge;
    }

    return canSaveArticle;
  }

  const canSaveCurrentStatus = canSaveStatus(draft.status);
  const effectiveRevisionSlaDays = draft.revisionSlaDays.trim()
    ? Number(draft.revisionSlaDays)
    : defaultRevisionSlaDays(
        draft.roleScope,
        draft.materials,
        revisionSlaPolicy,
      );
  const reviewQueueRows = useMemo(
    () => report.rows.filter((row) => row.status === reviewQueueTab),
    [report.rows, reviewQueueTab],
  );
  const statusOptions = useMemo(
    () =>
      (Object.entries(statusLabels) as Array<
        [StaffKnowledgeArticleStatus, string]
      >).filter(([value]) => {
        if (value === draft.status) {
          return true;
        }

        if (value === "PUBLISHED" || value === "ARCHIVED") {
          return report.canPublishKnowledge;
        }

        if (value === "REVIEW") {
          return report.canEditKnowledge || report.canReviewKnowledge;
        }

        if (value === "RETURNED") {
          return report.canReviewKnowledge;
        }

        return report.canEditKnowledge || report.canReviewKnowledge;
      }),
    [
      draft.status,
      report.canEditKnowledge,
      report.canPublishKnowledge,
      report.canReviewKnowledge,
    ],
  );
  const currentDraftSnapshot = useMemo(() => draftSnapshot(draft), [draft]);
  const hasUnsavedChanges =
    report.canManageKnowledge &&
    !isPending &&
    currentDraftSnapshot !== savedDraftSnapshot;

  function loadArticle(row: StaffKnowledgeArticle | null) {
    const nextDraft = row ? fromArticle(row) : defaultDraft();
    setDraft(nextDraft);
    setSavedDraftSnapshot(draftSnapshot(nextDraft));
    setMessage(null);
    setError(null);

    if (report.canManageKnowledge) {
      setIsBuilderOpen(true);
    }
  }

  function updateDraft(patch: Partial<DraftArticle>) {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage(null);
    setError(null);

    if (report.canManageKnowledge) {
      setIsBuilderOpen(true);
    }
  }

  function loadSeed(
    seed: Omit<DraftArticle, "id" | "storeId" | "revisionSlaDays">,
  ) {
    setDraft({ ...seed, id: null, storeId: "", revisionSlaDays: "" });
    setMessage("Черновик загружен. Проверьте текст и сохраните статью.");
    setError(null);
    setIsBuilderOpen(true);
  }

  function loadSuggestion(suggestion: StaffKnowledgeArticleSuggestion) {
    setDraft({
      id: null,
      title: suggestion.draft.title,
      summary: suggestion.draft.summary,
      content: suggestion.draft.content,
      folder: suggestion.draft.folder,
      category: suggestion.draft.category,
      roleScope: suggestion.draft.roleScope,
      status: "DRAFT",
      templateKey: suggestion.draft.templateKey,
      requiresReading: suggestion.draft.requiresReading,
      revisionSlaDays: "",
      storeId: suggestion.store?.id ?? "",
      tagsText: suggestion.draft.tags.join(", "),
      materials: suggestion.draft.materials,
      relatedLinks: suggestion.draft.relatedLinks,
      approvalNote: suggestion.draft.approvalNote,
    });
    setMessage(
      "Черновик создан из повторяющегося провала чек-листа. Проверьте текст и сохраните статью.",
    );
    setError(null);
    setIsBuilderOpen(true);
  }

  function addMaterial() {
    setDraft((current) => ({
      ...current,
      materials: [
        ...current.materials,
        {
          id: uid("material"),
          title: "",
          type: "TEXT",
          url: null,
          content: "",
          note: "",
          required: false,
        },
      ],
    }));
  }

  function updateMaterial(
    materialId: string,
    patch: Partial<StaffKnowledgeMaterial>,
  ) {
    setDraft((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === materialId ? { ...material, ...patch } : material,
      ),
    }));
  }

  function removeMaterial(materialId: string) {
    setDraft((current) => ({
      ...current,
      materials: current.materials.filter((material) => material.id !== materialId),
    }));
  }

  function addRelatedLink() {
    setDraft((current) => ({
      ...current,
      relatedLinks: [
        ...current.relatedLinks,
        {
          id: uid("link"),
          type: "OTHER",
          title: "",
          url: "",
          note: "",
        },
      ],
    }));
  }

  function updateRelatedLink(
    linkId: string,
    patch: Partial<StaffKnowledgeRelatedLink>,
  ) {
    setDraft((current) => ({
      ...current,
      relatedLinks: current.relatedLinks.map((link) =>
        link.id === linkId ? { ...link, ...patch } : link,
      ),
    }));
  }

  function removeRelatedLink(linkId: string) {
    setDraft((current) => ({
      ...current,
      relatedLinks: current.relatedLinks.filter((link) => link.id !== linkId),
    }));
  }


  function addUploadedImageMaterial(attachment: StaffAttachmentUploadResult) {
    setDraft((current) => {
      if (current.materials.some((material) => material.url === attachment.url)) {
        return current;
      }

      return {
        ...current,
        materials: [
          ...current.materials,
          {
            id: uid("material-image"),
            title: attachment.fileName,
            type: "IMAGE",
            url: attachment.url,
            content: null,
            note: "",
            required: false,
          },
        ],
      };
    });
    setMessage("Картинка добавлена в текст статьи и материалы.");
    setError(null);
  }

  function openDraftPreview() {
    const opened = openKnowledgeReadingWindow(
      draftReadingData(draft, report, effectiveRevisionSlaDays),
    );

    if (!opened) {
      setError("Браузер заблокировал окно предпросмотра.");
    }
  }

  function openArticleForReading(article: StaffKnowledgeArticle) {
    const opened = openKnowledgeReadingWindow(articleReadingData(article));

    if (!opened) {
      setError("Браузер заблокировал окно чтения.");
    }
  }

  async function saveArticle(statusOverride?: StaffKnowledgeArticleStatus) {
    if (!draft.title.trim()) {
      setError("Укажите название статьи.");
      return false;
    }

    const targetStatus = statusOverride ?? draft.status;

    if (!canSaveStatus(targetStatus)) {
      setError("У вашей роли нет прав на изменение базы знаний.");
      return false;
    }

    setIsPending(true);
    setError(null);
    setMessage(null);

    const payload = {
      title: draft.title.trim(),
      summary: draft.summary.trim() || null,
      content: draft.content.trim() || null,
      folder: draft.folder.trim() || "Общие",
      category: draft.category.trim() || "Общие стандарты",
      roleScope: draft.roleScope,
      status: targetStatus,
      templateKey: draft.templateKey || null,
      requiresReading: draft.requiresReading,
      revisionSlaDays: draft.revisionSlaDays.trim()
        ? Number(draft.revisionSlaDays)
        : null,
      storeId: draft.storeId || null,
      tags: tagsFromText(draft.tagsText),
      materials: draft.materials
        .map((material) => ({
          ...material,
          title: material.title.trim(),
          url: material.url?.trim() || null,
          content: material.content?.trim() || null,
          note: material.note?.trim() || null,
        }))
        .filter(
          (material) => material.title || material.url || material.content,
        ),
      relatedLinks: draft.relatedLinks
        .map((link) => ({
          ...link,
          title: link.title.trim(),
          url: link.url?.trim() || null,
          note: link.note?.trim() || null,
        }))
        .filter((link) => link.title || link.url),
      approvalNote: draft.approvalNote.trim() || null,
    };

    try {
      const response = await fetch(
        draft.id
          ? `/api/staff/knowledge-base/${draft.id}`
          : "/api/staff/knowledge-base",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось сохранить статью");
      }

      const saved = (await response.json()) as StaffKnowledgeArticle;
      const savedDraft = fromArticle(saved);
      setDraft(savedDraft);
      setSavedDraftSnapshot(draftSnapshot(savedDraft));
      setMessage("Статья сохранена.");
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
      return false;
    } finally {
      setIsPending(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveArticle();
  }

  async function markRead(article: StaffKnowledgeArticle) {
    setReadPendingId(article.id);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/staff/knowledge-base/${article.id}/read-receipts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: "Прочитано из базы знаний" }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось отметить прочтение");
      }

      setMessage("Прочтение отмечено.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setReadPendingId(null);
    }
  }

  function updateRevisionSlaPolicy(
    patch: Partial<StaffKnowledgeRevisionSlaPolicy>,
  ) {
    setRevisionSlaPolicy((current) => ({ ...current, ...patch }));
    setMessage(null);
    setError(null);
  }

  function updateRevisionSlaRole(
    roleScope: StaffKnowledgeRoleScope,
    value: string,
  ) {
    updateRevisionSlaPolicy({
      roleDays: {
        ...revisionSlaPolicy.roleDays,
        [roleScope]: Number(value),
      },
    });
  }

  function updateRevisionSlaMaterialExtra(
    materialType: StaffKnowledgeMaterialType,
    value: string,
  ) {
    updateRevisionSlaPolicy({
      materialTypeExtraDays: {
        ...revisionSlaPolicy.materialTypeExtraDays,
        [materialType]: Number(value),
      },
    });
  }

  async function saveRevisionSlaPolicy() {
    setSettingsPending(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/staff/knowledge-base/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionSlaPolicy }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "Не удалось сохранить SLA");
      }

      const saved = (await response.json()) as {
        revisionSlaPolicy: StaffKnowledgeRevisionSlaPolicy;
        history: StaffKnowledgeSettingsEvent[];
      };
      setRevisionSlaPolicy(saved.revisionSlaPolicy);
      setSettingsHistory(saved.history);
      setMessage("Политика SLA базы знаний сохранена.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса");
    } finally {
      setSettingsPending(false);
    }
  }

  const { prompt: unsavedDraftPrompt, guardAction } = useUnsavedDraftPrompt({
    enabled: hasUnsavedChanges,
    onSaveDraft: () => saveArticle("DRAFT"),
  });

  return (
    <>
      {unsavedDraftPrompt}
      <div className="space-y-6">
      {report.canManageKnowledge ? (
        <details className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  Политика SLA
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  Возврат материалов на доработку
                </h2>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                базово {revisionSlaPolicy.defaultDays} дн.
              </span>
            </div>
          </summary>

          <div className="mt-4 space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Базовый срок
                </span>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={revisionSlaPolicy.defaultDays}
                  onChange={(event) =>
                    updateRevisionSlaPolicy({
                      defaultDays: Number(event.target.value),
                    })
                  }
                  className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              {revisionSlaRoleOrder.map((roleScope) => (
                <label key={roleScope} className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    {roleScopeLabels[roleScope]}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={revisionSlaPolicy.roleDays[roleScope]}
                    onChange={(event) =>
                      updateRevisionSlaRole(roleScope, event.target.value)
                    }
                    className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
              ))}
            </div>

            <div>
              <p className="text-xs font-bold uppercase text-zinc-500">
                Дополнительные дни за обязательные материалы
              </p>
              <div className="mt-2 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                {revisionSlaMaterialTypeOrder.map((materialType) => (
                  <label key={materialType} className="space-y-1">
                    <span className="text-xs font-semibold text-zinc-500">
                      {materialTypeLabels[materialType]}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={7}
                      value={revisionSlaPolicy.materialTypeExtraDays[materialType]}
                      onChange={(event) =>
                        updateRevisionSlaMaterialExtra(
                          materialType,
                          event.target.value,
                        )
                      }
                      className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-zinc-500">
                Статьи без ручного SLA используют срок по роли и самый большой
                бонус среди обязательных материалов. Уже возвращенные статьи
                без ручного срока пересчитываются при сохранении политики.
              </p>
              <button
                type="button"
                onClick={() => void saveRevisionSlaPolicy()}
                disabled={settingsPending}
                className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {settingsPending ? "Сохраняем..." : "Сохранить SLA"}
              </button>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-zinc-500">
                    История SLA
                  </p>
                  <p className="text-xs text-zinc-500">
                    Последние изменения правил согласования базы знаний.
                  </p>
                </div>
                {report.settings.updatedAt ? (
                  <span className="text-xs text-zinc-500">
                    Обновлено {formatDateTime(report.settings.updatedAt)}
                  </span>
                ) : null}
              </div>

              {settingsHistory.length > 0 ? (
                <div className="mt-3 grid gap-2">
                  {settingsHistory.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-semibold">
                          {slaPolicyHistorySummary(event)}
                        </p>
                        <span className="text-xs text-zinc-500">
                          {formatDateTime(event.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        Изменил: {formatSettingsActor(event.actorUser)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700">
                  История появится после первого сохранения политики SLA.
                </p>
              )}
            </div>
          </div>
        </details>
      ) : null}

      {report.canEditKnowledge ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Быстрый старт
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Заготовки для базы знаний
              </h2>
            </div>
            <button
              type="button"
              onClick={() => guardAction(() => loadArticle(null))}
              className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              Новая статья
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {seedArticles.map((seed) => (
              <button
                key={seed.title}
                type="button"
                onClick={() => guardAction(() => loadSeed(seed))}
                className="rounded-lg border border-zinc-200 p-3 text-left transition hover:border-emerald-500 hover:bg-emerald-50/70 dark:border-zinc-800 dark:hover:bg-emerald-500/10"
              >
                <span className="text-sm font-semibold">{seed.title}</span>
                <span className="mt-2 block text-xs leading-5 text-zinc-500">
                  {seed.summary}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-zinc-500">
                  Подсказки из чек-листов
                </p>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  Повторяющиеся провалы превращаются в черновики стандартов без
                  ручного поиска по выполненным чек-листам.
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {report.articleSuggestions.length}
              </span>
            </div>

            {report.articleSuggestions.length === 0 ? (
              <p className="mt-3 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800">
                Повторяющихся провалов за последние 90 дней пока нет, либо по
                ним уже заведены похожие материалы.
              </p>
            ) : (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {report.articleSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => guardAction(() => loadSuggestion(suggestion))}
                    className="rounded-lg border border-zinc-200 p-3 text-left transition hover:border-emerald-500 hover:bg-emerald-50/70 dark:border-zinc-800 dark:hover:bg-emerald-500/10"
                  >
                    <span className="text-sm font-semibold">
                      {suggestion.title}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-zinc-500">
                      {suggestion.detail}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                        {suggestion.occurrences} повторов
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {suggestion.store?.name ?? "Вся сеть"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {report.canReviewKnowledge || report.canPublishKnowledge ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Очередь согласования
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Проверка и публикация материалов
              </h2>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                Проверяющий возвращает материал с комментарием или передает
                дальше, публикатор выпускает версию и запускает контроль
                прочтения.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="/staff/tasks?view=approval"
                className="inline-flex h-9 items-center rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/15"
              >
                Задачи на доработку
              </a>
              {reviewQueueTabs.map((tab) => {
                const count = report.rows.filter(
                  (row) => row.status === tab.key,
                ).length;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setReviewQueueTab(tab.key)}
                    className={[
                      "h-9 rounded-md border px-3 text-xs font-semibold transition",
                      reviewQueueTab === tab.key
                        ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                        : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900",
                    ].join(" ")}
                  >
                    {tab.label} · {count}
                  </button>
                );
              })}
            </div>
          </div>

          {reviewQueueRows.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-800">
              {
                reviewQueueTabs.find((tab) => tab.key === reviewQueueTab)
                  ?.empty
              }
            </p>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {reviewQueueRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => guardAction(() => loadArticle(row))}
                  className="rounded-lg border border-zinc-200 p-3 text-left transition hover:border-emerald-500 hover:bg-emerald-50/70 dark:border-zinc-800 dark:hover:bg-emerald-500/10"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{row.title}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {statusLabels[row.status]}
                    </span>
                    <RevisionSlaPill article={row} />
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-zinc-500">
                    {row.folder} · {row.category} ·{" "}
                    {row.store?.name ?? "Вся сеть"}
                  </span>
                  {row.approvalNote ? (
                    <span className="mt-2 block text-xs leading-5 text-zinc-500">
                      {row.approvalNote}
                    </span>
                  ) : null}
                  <span className="mt-2 block text-[11px] font-semibold uppercase text-zinc-400">
                    Обновлено {formatDateTime(row.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <div className="space-y-6">
        {report.canManageKnowledge ? (
          <details
            open={isBuilderOpen}
            onToggle={(event) =>
              setIsBuilderOpen(event.currentTarget.open)
            }
            className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          >
            <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                    Конструктор
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {draft.id ? "Редактирование статьи" : "Новая статья"}
                  </h2>
                </div>
                <span className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                  {isBuilderOpen ? "Свернуть" : "Развернуть"}
                </span>
              </div>
            </summary>
            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
              <form onSubmit={save}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                    Конструктор
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {draft.id ? "Редактирование статьи" : "Новая статья"}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[
                      {
                        label: "Черновики",
                        enabled: report.canEditKnowledge,
                      },
                      {
                        label: "Согласование",
                        enabled: report.canReviewKnowledge,
                      },
                      {
                        label: "Публикация",
                        enabled: report.canPublishKnowledge,
                      },
                    ].map((item) => (
                      <span
                        key={item.label}
                        className={[
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          item.enabled
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                        ].join(" ")}
                      >
                        {item.label}
                      </span>
                    ))}
                    {selectedArticle ? (
                      <RevisionSlaPill article={selectedArticle} />
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openDraftPreview}
                    className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Предпросмотр
                  </button>
                  <button
                  type="submit"
                  disabled={isPending || !canSaveCurrentStatus}
                  className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending
                    ? "Сохраняем..."
                    : canSaveCurrentStatus
                      ? "Сохранить"
                      : "Нет прав"}
                </button>

                </div>
                {selectedArticle?.status === "RETURNED" ? (
                  <a
                    href="/staff/tasks?view=approval"
                    className="inline-flex h-10 items-center rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/15"
                  >
                    Открыть задачу на доработку
                  </a>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Название
                  </span>
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      updateDraft({ title: event.target.value })
                    }
                    placeholder="Например: работа с конфликтным гостем"
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Статус
                  </span>
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      updateDraft({
                        status: event.target.value as StaffKnowledgeArticleStatus,
                      })
                    }
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {statusOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Workflow:
                </span>{" "}
                черновики редактируют роли с правом базы знаний, согласование
                ведут проверяющие, публикация и архив требуют отдельного
                права публикатора. Публикация создает новую версию, а
                обязательные статьи попадают в контроль прочтения.
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-4">
                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Папка
                  </span>
                  <input
                    value={draft.folder}
                    onChange={(event) =>
                      updateDraft({ folder: event.target.value })
                    }
                    placeholder="Сервис, смены, касса"
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Категория
                  </span>
                  <input
                    value={draft.category}
                    onChange={(event) =>
                      updateDraft({ category: event.target.value })
                    }
                    placeholder="Смена, сервис, касса"
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Видимость
                  </span>
                  <select
                    value={draft.roleScope}
                    onChange={(event) =>
                      updateDraft({
                        roleScope: event.target.value as StaffKnowledgeRoleScope,
                      })
                    }
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {Object.entries(roleScopeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    SLA возврата, дней
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={draft.revisionSlaDays}
                    onChange={(event) =>
                      updateDraft({ revisionSlaDays: event.target.value })
                    }
                    placeholder={`${defaultRevisionSlaDays(
                      draft.roleScope,
                      draft.materials,
                      revisionSlaPolicy,
                    )}`}
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <span className="block text-xs leading-5 text-zinc-500">
                    Пусто = авто по роли и типам материалов:{" "}
                    {effectiveRevisionSlaDays} дн.
                  </span>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Клуб
                  </span>
                  <select
                    value={draft.storeId}
                    onChange={(event) =>
                      updateDraft({ storeId: event.target.value })
                    }
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="">Вся сеть</option>
                    {report.stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
                <label className="inline-flex min-h-11 items-center gap-3 rounded-md border border-zinc-300 px-3 text-sm font-semibold dark:border-zinc-700">
                  <input
                    type="checkbox"
                    checked={draft.requiresReading}
                    onChange={(event) =>
                      updateDraft({ requiresReading: event.target.checked })
                    }
                  />
                  Обязательное прочтение сотрудниками
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold uppercase text-zinc-500">
                    Заметка согласования
                  </span>
                  <input
                    value={draft.approvalNote}
                    onChange={(event) =>
                      updateDraft({ approvalNote: event.target.value })
                    }
                    placeholder="Что изменено или почему материал готов"
                    className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </label>
              </div>

              <label className="mt-3 block space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Кратко
                </span>
                <input
                  value={draft.summary}
                  onChange={(event) =>
                    updateDraft({ summary: event.target.value })
                  }
                  placeholder="О чем статья и когда ее читать"
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <div className="mt-3">
                <span className="mb-1 block text-xs font-bold uppercase text-zinc-500">
                  Основной текст
                </span>
                <StaffKnowledgeRichTextEditor
                  value={draft.content}
                  onChange={(content) => updateDraft({ content })}
                  onImageUploaded={addUploadedImageMaterial}
                />
              </div>

              <label className="mt-3 block space-y-1">
                <span className="text-xs font-bold uppercase text-zinc-500">
                  Теги
                </span>
                <input
                  value={draft.tagsText}
                  onChange={(event) =>
                    updateDraft({ tagsText: event.target.value })
                  }
                  placeholder="смена, сервис, касса"
                  className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <div className="mt-5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                      Учебные материалы
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      Текстовые блоки, видео, изображения, файлы и внешние
                      ссылки к этой статье.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addMaterial}
                    className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Добавить материал
                  </button>
                </div>

                {draft.materials.length === 0 ? (
                  <p className="mt-3 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-800">
                    Материалов пока нет. Статья может состоять только из текста.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {draft.materials.map((material, index) => (
                      <div
                        key={material.id}
                        className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900/50"
                      >
                        <div className="grid gap-3 lg:grid-cols-[1fr_10rem_1fr_auto]">
                          <div className="space-y-1">
                            <span className="text-xs font-bold uppercase text-zinc-500">
                              Материал {index + 1}
                            </span>
                            <input
                              value={material.title}
                              onChange={(event) =>
                                updateMaterial(material.id, {
                                  title: event.target.value,
                                })
                              }
                              placeholder="Название"
                              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                            />
                          </div>

                          <div className="space-y-1">
                            <span className="text-xs font-bold uppercase text-zinc-500">
                              Тип
                            </span>
                            <select
                              value={material.type}
                              onChange={(event) =>
                                updateMaterial(material.id, {
                                  type: event.target
                                    .value as StaffKnowledgeMaterialType,
                                })
                              }
                              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                            >
                              {Object.entries(materialTypeLabels).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <span className="text-xs font-bold uppercase text-zinc-500">
                              Ссылка
                            </span>
                            <input
                              value={material.url ?? ""}
                              onChange={(event) =>
                                updateMaterial(material.id, {
                                  url: event.target.value,
                                })
                              }
                              placeholder="https://..."
                              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                            />
                            <StaffAttachmentUpload
                              label="Загрузить материал"
                              buttonLabel="Загрузить файл"
                              onUploaded={(attachment) =>
                                updateMaterial(material.id, {
                                  title: material.title || attachment.fileName,
                                  type: materialTypeFromAttachment(attachment),
                                  url: attachment.url,
                                })
                              }
                            />
                          </div>

                          <div className="flex items-end gap-2">
                            <label className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-xs font-semibold dark:border-zinc-700">
                              <input
                                type="checkbox"
                                checked={material.required}
                                onChange={(event) =>
                                  updateMaterial(material.id, {
                                    required: event.target.checked,
                                  })
                                }
                              />
                              Обяз.
                            </label>
                            <button
                              type="button"
                              onClick={() => removeMaterial(material.id)}
                              className="h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                            >
                              Убрать
                            </button>
                          </div>
                        </div>

                        <label className="mt-3 block space-y-1">
                          <span className="text-xs font-bold uppercase text-zinc-500">
                            Текст материала
                          </span>
                          <textarea
                            value={material.content ?? ""}
                            onChange={(event) =>
                              updateMaterial(material.id, {
                                content: event.target.value,
                              })
                            }
                            rows={3}
                            placeholder="Заполните для текстового материала или добавьте пояснение к ссылке."
                            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          />
                        </label>

                        <label className="mt-3 block space-y-1">
                          <span className="text-xs font-bold uppercase text-zinc-500">
                            Примечание
                          </span>
                          <input
                            value={material.note ?? ""}
                            onChange={(event) =>
                              updateMaterial(material.id, {
                                note: event.target.value,
                              })
                            }
                            placeholder="Что сотрудник должен вынести из материала"
                            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                      Связанные стандарты
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      Ссылки на регламенты, чек-листы, обучение, адаптацию,
                      задачи или разборы нарушений.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addRelatedLink}
                    className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Добавить связь
                  </button>
                </div>

                {draft.relatedLinks.length === 0 ? (
                  <p className="mt-3 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-800">
                    Связей пока нет. Их можно добавить позднее, когда статья
                    станет частью регламента, чек-листа или курса.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {draft.relatedLinks.map((link) => (
                      <div
                        key={link.id}
                        className="grid gap-3 rounded-md bg-zinc-50 p-3 dark:bg-zinc-900/50 lg:grid-cols-[11rem_1fr_1fr_auto]"
                      >
                        <label className="space-y-1">
                          <span className="text-xs font-bold uppercase text-zinc-500">
                            Тип
                          </span>
                          <select
                            value={link.type}
                            onChange={(event) =>
                              updateRelatedLink(link.id, {
                                type: event.target
                                  .value as StaffKnowledgeRelatedLinkType,
                              })
                            }
                            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          >
                            {Object.entries(relatedLinkTypeLabels).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="text-xs font-bold uppercase text-zinc-500">
                            Название
                          </span>
                          <input
                            value={link.title}
                            onChange={(event) =>
                              updateRelatedLink(link.id, {
                                title: event.target.value,
                              })
                            }
                            placeholder="Например: чек-лист кассы"
                            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="text-xs font-bold uppercase text-zinc-500">
                            Ссылка
                          </span>
                          <input
                            value={link.url ?? ""}
                            onChange={(event) =>
                              updateRelatedLink(link.id, {
                                url: event.target.value,
                              })
                            }
                            placeholder="/staff/checklist-templates"
                            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => removeRelatedLink(link.id)}
                          className="self-end rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        >
                          Убрать
                        </button>

                        <label className="space-y-1 lg:col-span-4">
                          <span className="text-xs font-bold uppercase text-zinc-500">
                            Примечание
                          </span>
                          <input
                            value={link.note ?? ""}
                            onChange={(event) =>
                              updateRelatedLink(link.id, {
                                note: event.target.value,
                              })
                            }
                            placeholder="Зачем эта связь нужна сотруднику"
                            className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <details className="mt-5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <summary className="cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                        Тест
                      </p>
                      <h3 className="mt-1 text-base font-semibold">Тест прохождения (опция)</h3>
                    </div>
                    <span className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                      Открыть
                    </span>
                  </div>
                </summary>
                <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
                  <StaffMaterialPreview
                  title={draft.title}
                  description={draft.summary}
                  body={draft.content}
                  metrics={[
                    { label: "Папка", value: draft.folder || "Общие" },
                    { label: "Категория", value: draft.category || "Без категории" },
                    { label: "Видимость", value: roleScopeLabels[draft.roleScope] },
                    {
                      label: "Контур",
                      value: draft.storeId
                        ? report.stores.find((store) => store.id === draft.storeId)
                            ?.name ?? "Клуб"
                        : "Вся сеть",
                    },
                    { label: "Статус", value: statusLabels[draft.status] },
                    {
                      label: "Прочтение",
                      value: draft.requiresReading
                        ? "Обязательное"
                        : "Необязательное",
                    },
                    {
                      label: "SLA возврата",
                      value: `${effectiveRevisionSlaDays} дн.`,
                    },
                  ]}
                  tags={tagsFromText(draft.tagsText)}
                  steps={[
                    {
                      id: "knowledge-read",
                      title: "Прочитать материал",
                      typeLabel: "Статья",
                      content:
                        draft.summary ||
                        "Сотрудник видит основной текст и материалы статьи.",
                      required: true,
                    },
                    ...draft.materials
                      .filter(
                        (material) =>
                          material.title.trim() ||
                          material.content?.trim() ||
                          material.url?.trim(),
                      )
                      .map((material, index) => ({
                        id: material.id || `knowledge-material-${index}`,
                        title: material.title || `Материал ${index + 1}`,
                        typeLabel: materialTypeLabels[material.type],
                        content: material.note || material.content,
                        url: material.url,
                        required: material.required,
                      })),
                    ...draft.relatedLinks
                      .filter((link) => link.title.trim() || link.url?.trim())
                      .map((link, index) => ({
                        id: link.id || `knowledge-link-${index}`,
                        title: link.title || `Связь ${index + 1}`,
                        typeLabel: relatedLinkTypeLabels[link.type],
                        content: link.note,
                        url: link.url,
                        required: false,
                      })),
                  ]}
                  attachments={draft.materials
                    .filter(
                      (material) =>
                        material.title.trim() ||
                        material.content?.trim() ||
                        material.url?.trim(),
                    )
                    .map((material, index) => ({
                      id: material.id || `knowledge-attachment-${index}`,
                      title: material.title || `Материал ${index + 1}`,
                      typeLabel: materialTypeLabels[material.type],
                      url: material.url,
                      content: material.content,
                      note: material.note,
                      required: material.required,
                    }))}
                  emptyLabel="В статье пока нет тестовых действий для сотрудника."
                />
                </div>
              </details>

              {selectedArticle ? (
                <VersionHistory article={selectedArticle} />
              ) : null}
              </form>
            </div>
          </details>
        ) : null}

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                Каталог
              </p>
              <h2 className="mt-1 text-lg font-semibold">Статьи и материалы</h2>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {report.rows.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {report.rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-800">
                Материалов пока нет. Руководитель или менеджер по стандартам
                может создать первую статью в конструкторе выше.
              </p>
            ) : (
              report.rows.map((row) => (
                <article
                  key={row.id}
                  className={[
                    "rounded-lg border p-3 transition",
                    draft.id === row.id
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">{row.title}</h3>
                        {report.canManageKnowledge ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {statusLabels[row.status]}
                          </span>
                        ) : null}
                        <RevisionSlaPill article={row} />
                      </div>
                      {row.summary ? (
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                          {row.summary}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-zinc-500">
                        {row.folder} · {row.category} ·{" "}
                        {roleScopeLabels[row.roleScope]} ·{" "}
                        {row.store?.name ?? "Вся сеть"} · материалов:{" "}
                        {row.materialsCount}
                        {row.requiresReading
                          ? " · обязательное прочтение"
                          : ""}
                      </p>
                      {row.requiresReading ? (
                        <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          Прочитали {row.readingSummary.readCount}/
                          {row.readingSummary.requiredCount}
                          {row.readingSummary.requiredByMe &&
                          !row.readingSummary.readByMe
                            ? " · требуется от вас"
                            : ""}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => guardAction(() => loadArticle(row))}
                        className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      >
                        {report.canManageKnowledge ? "Редактировать" : "Показать здесь"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openArticleForReading(row)}
                        className="h-9 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-400 dark:text-zinc-950 dark:hover:bg-emerald-300"
                      >
                        Открыть для чтения
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {!report.canManageKnowledge && selectedArticle ? (
          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <ArticlePreview
              article={selectedArticle}
              onMarkRead={markRead}
              isReadPending={readPendingId === selectedArticle.id}
            />
          </section>
        ) : null}

        {message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}
      </div>
      </div>
    </>
  );
}

function ArticlePreview({
  article,
  onMarkRead,
  isReadPending,
}: {
  article: StaffKnowledgeArticle;
  onMarkRead: (article: StaffKnowledgeArticle) => void;
  isReadPending: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
        Материал
      </p>
      <h2 className="mt-1 text-2xl font-semibold">{article.title}</h2>
      <p className="mt-2 text-sm text-zinc-500">
        {article.folder} · {article.category} ·{" "}
        {roleScopeLabels[article.roleScope]} ·{" "}
        опубликовано: {formatDateTime(article.publishedAt)} · SLA возврата:{" "}
        {article.revisionSlaDaysEffective} дн.
        {article.requiresReading ? " · обязательное прочтение" : ""}
      </p>
      {article.requiresReading ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-100">
                {article.readingSummary.readByMe
                  ? "Вы уже отметили прочтение"
                  : article.readingSummary.requiredByMe
                    ? "Материал назначен вам для обязательного прочтения"
                    : "Материал обязательный для целевой роли"}
              </p>
              <p className="mt-1 text-emerald-800/80 dark:text-emerald-200/80">
                Прочитали {article.readingSummary.readCount}/
                {article.readingSummary.requiredCount}; ждут{" "}
                {article.readingSummary.pendingCount}.
                {article.readingSummary.readAt
                  ? ` Ваша отметка: ${formatDateTime(
                      article.readingSummary.readAt,
                    )}.`
                  : ""}
              </p>
            </div>
            {article.readingSummary.requiredByMe &&
            !article.readingSummary.readByMe ? (
              <button
                type="button"
                disabled={isReadPending}
                onClick={() => onMarkRead(article)}
                className="h-10 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isReadPending ? "Отмечаем..." : "Отметить прочтение"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {article.summary ? (
        <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 dark:border-zinc-800 dark:bg-zinc-900/50">
          {article.summary}
        </p>
      ) : null}
      {article.content ? (
        <KnowledgeArticleRichText value={article.content} className="mt-4" />
      ) : null}
      {article.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {article.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {article.materials.length > 0 ? (
        <div className="mt-5 space-y-2">
          {article.materials.map((material) => (
            <div
              key={material.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{material.title}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {materialTypeLabels[material.type]}
                </span>
                {material.required ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                    обязательно
                  </span>
                ) : null}
              </div>
              {material.content ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {material.content}
                </p>
              ) : null}
              {material.type === "IMAGE" && material.url ? (
                <img
                  src={material.url}
                  alt={material.title || "Изображение материала"}
                  className="mt-3 max-h-[520px] w-full rounded-lg border border-zinc-200 object-contain dark:border-zinc-800"
                  loading="lazy"
                />
              ) : null}
              {material.url ? (
                <a
                  href={material.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
                >
                  Открыть материал
                </a>
              ) : null}
              {material.note ? (
                <p className="mt-2 text-xs text-zinc-500">{material.note}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {article.relatedLinks.length > 0 ? (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-bold uppercase text-zinc-500">
            Связанные стандарты
          </p>
          {article.relatedLinks.map((link) => (
            <div
              key={link.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{link.title}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {relatedLinkTypeLabels[link.type]}
                </span>
              </div>
              {link.note ? (
                <p className="mt-2 text-sm text-zinc-500">{link.note}</p>
              ) : null}
              {link.url ? (
                <a
                  href={link.url}
                  target={link.url.startsWith("/") ? undefined : "_blank"}
                  rel={link.url.startsWith("/") ? undefined : "noreferrer"}
                  className="mt-2 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-600 dark:text-emerald-300"
                >
                  Открыть связанный раздел
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <VersionHistory article={article} />
    </div>
  );
}

function VersionHistory({ article }: { article: StaffKnowledgeArticle }) {
  return (
    <div className="mt-5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
            История версий
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Текущая версия: {article.version || "нет опубликованных версий"}.
            Публикация создает новый snapshot материала.
          </p>
        </div>
        {article.approvedAt ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
            утверждено {formatDateTime(article.approvedAt)}
          </span>
        ) : null}
      </div>

      {article.approvalNote ? (
        <p className="mt-3 rounded-md bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300">
          {article.approvalNote}
        </p>
      ) : null}

      {article.requiresReading ? (
        <div className="mt-3 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">Контроль прочтения</span>
            <span className="text-xs text-zinc-500">
              {article.readingSummary.readCount}/
              {article.readingSummary.requiredCount} прочитали, ждут{" "}
              {article.readingSummary.pendingCount}
            </span>
          </div>
          {article.readReceipts.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {article.readReceipts.slice(0, 8).map((receipt) => (
                <span
                  key={receipt.id}
                  className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300"
                >
                  {receipt.user.fullName ?? receipt.user.email} ·{" "}
                  {formatDateTime(receipt.readAt)}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">
              Отметок прочтения по текущей версии пока нет.
            </p>
          )}
        </div>
      ) : null}

      {article.workflowEvents.length > 0 ? (
        <div className="mt-3 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">Журнал согласования</span>
            <span className="text-xs text-zinc-500">
              {article.workflowEvents.length} событий
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {article.workflowEvents.map((event) => (
              <div
                key={event.id}
                className="border-l-2 border-zinc-300 pl-3 dark:border-zinc-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{event.title}</span>
                  <span className="text-xs text-zinc-500">
                    {formatDateTime(event.happenedAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {event.actor
                    ? event.actor.fullName ?? event.actor.email
                    : "Системное событие"}
                  {event.detail ? ` · ${event.detail}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {article.versions.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-800">
          Версий пока нет. Они появятся после публикации материала.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {article.versions.map((version) => (
            <div
              key={version.id}
              className="rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">Версия {version.version}</span>
                <span className="text-xs text-zinc-500">
                  {formatDateTime(version.createdAt)}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {version.folder} · {version.category} ·{" "}
                {roleScopeLabels[version.roleScope]} · материалов:{" "}
                {version.materialsCount} · связей: {version.relatedLinksCount}
              </p>
              {version.createdByUser ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Автор версии:{" "}
                  {version.createdByUser.fullName ?? version.createdByUser.email}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

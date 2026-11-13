// «Обучение и база знаний»: one home for training courses and knowledge
// articles, laid out like a document editor's start page. Pure helpers only,
// so the page and the tests share them.

export type LearningRoleScope =
  | "ALL_STAFF"
  | "ADMINISTRATOR"
  | "SENIOR_ADMINISTRATOR"
  | "CLUB_MANAGER"
  | "MANAGER"
  | "STANDARDS_MANAGER";

export type LearningDocumentKind = "COURSE" | "ARTICLE";

export type LearningThumbnailBlock = {
  kind: "title" | "heading" | "paragraph" | "item" | "task" | "tabs";
  text: string;
};

export type LearningDocumentBadge = {
  label: string;
  tone: "green" | "amber" | "gray";
};

export type LearningDocument = {
  id: string;
  kind: LearningDocumentKind;
  title: string;
  href: string;
  updatedAt: string;
  roleScope: LearningRoleScope;
  isDraft: boolean;
  requiredForMe: boolean;
  /** «Курс · 3 вкладки · 12 нояб.» or «Касса · 12 нояб.». */
  meta: string;
  /** Who it is for, or how many have read it. */
  note: string;
  noteTone: "muted" | "attention";
  badge: LearningDocumentBadge | null;
  thumbnail: LearningThumbnailBlock[];
  searchText: string;
};

export type LearningCourseInput = {
  id: string;
  title: string;
  description: string | null;
  roleScope: LearningRoleScope;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  required: boolean;
  steps: Array<{
    title: string;
    type: "ARTICLE" | "TEXT" | "LINK" | "TASK";
    content: string | null;
  }>;
  updatedAt: string;
};

export type LearningArticleInput = {
  id: string;
  kind: "ARTICLE" | "INFORMATION";
  title: string;
  summary: string | null;
  content: string | null;
  folder: string;
  roleScope: LearningRoleScope;
  status: "DRAFT" | "REVIEW" | "RETURNED" | "PUBLISHED" | "ARCHIVED";
  requiresReading: boolean;
  updatedAt: string;
  revisionDueAt: string | null;
  readingSummary: {
    requiredCount: number;
    readCount: number;
    requiredByMe: boolean;
    readByMe: boolean;
  };
};

export const learningRoleScopeLabels: Record<LearningRoleScope, string> = {
  ALL_STAFF: "Весь персонал",
  ADMINISTRATOR: "Администраторы",
  SENIOR_ADMINISTRATOR: "Старшие администраторы",
  CLUB_MANAGER: "Управляющие клубов",
  MANAGER: "Управляющие сети",
  STANDARDS_MANAGER: "Менеджер по стандартам",
};

export const learningFilters = [
  "all",
  "courses",
  "articles",
  "drafts",
  "to-read",
] as const;

export type LearningFilter = (typeof learningFilters)[number];

export function isLearningFilter(value: unknown): value is LearningFilter {
  return (
    typeof value === "string" &&
    (learningFilters as readonly string[]).includes(value)
  );
}

const THUMBNAIL_BLOCKS = 9;
const THUMBNAIL_TEXT = 140;

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function clip(value: string) {
  const text = value.replace(/\s+/g, " ").trim();

  return text.length > THUMBNAIL_TEXT
    ? `${text.slice(0, THUMBNAIL_TEXT - 1)}…`
    : text;
}

function stripMarkdownInline(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|\+\+|\*|__|_)(.+?)\1/g, "$2");
}

/**
 * Turns article or step content (sanitised HTML or the light markdown the
 * old editor writes) into a few plain-text blocks for a page thumbnail.
 * The result is text only: React escapes it, nothing is injected as HTML.
 */
export function contentToThumbnailBlocks(
  content: string | null | undefined,
): LearningThumbnailBlock[] {
  const raw = (content ?? "").trim();

  if (!raw) {
    return [];
  }

  const blocks: LearningThumbnailBlock[] = [];

  if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
    const withoutImages = raw
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<img[^>]*>/gi, "");
    const pattern = /<(h[1-6]|li|p|blockquote|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(withoutImages))) {
      const tag = match[1].toLowerCase();
      const text = clip(decodeEntities(match[2].replace(/<[^>]*>/g, " ")));

      if (!text) {
        continue;
      }

      blocks.push({
        kind: tag.startsWith("h")
          ? "heading"
          : tag === "li"
            ? "item"
            : "paragraph",
        text,
      });

      if (blocks.length >= THUMBNAIL_BLOCKS) {
        break;
      }
    }

    if (blocks.length === 0) {
      const text = clip(decodeEntities(withoutImages.replace(/<[^>]*>/g, " ")));

      return text ? [{ kind: "paragraph", text }] : [];
    }

    return blocks;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(trimmed);
    const item = /^(?:[-*•]|\d+[.)]|☐|☑)\s+(.*)$/.exec(trimmed);
    const text = clip(
      stripMarkdownInline(
        heading?.[1] ?? item?.[1] ?? trimmed.replace(/^>\s?/, ""),
      ),
    );

    if (!text) {
      continue;
    }

    blocks.push({
      kind: heading ? "heading" : item ? "item" : "paragraph",
      text,
    });

    if (blocks.length >= THUMBNAIL_BLOCKS) {
      break;
    }
  }

  return blocks;
}

function courseThumbnail(course: LearningCourseInput) {
  const blocks: LearningThumbnailBlock[] = [
    { kind: "title", text: clip(course.title) },
  ];

  if (course.steps.length > 0) {
    blocks.push({
      kind: "tabs",
      text: course.steps
        .slice(0, 3)
        .map((step, index) => `${index + 1} ${step.title}`)
        .join(" · "),
    });
  }

  if (course.description) {
    blocks.push({ kind: "paragraph", text: clip(course.description) });
  }

  for (const step of course.steps.slice(0, 6)) {
    blocks.push(
      step.type === "TASK"
        ? { kind: "task", text: clip(`Задание: ${step.title}`) }
        : { kind: "item", text: clip(step.title) },
    );
  }

  return blocks.slice(0, THUMBNAIL_BLOCKS + 1);
}

function articleThumbnail(article: LearningArticleInput) {
  const body = contentToThumbnailBlocks(article.content);
  const blocks: LearningThumbnailBlock[] = [
    { kind: "title", text: clip(article.title) },
  ];

  if (body.length === 0 && article.summary) {
    blocks.push({ kind: "paragraph", text: clip(article.summary) });
  }

  return [...blocks, ...body].slice(0, THUMBNAIL_BLOCKS + 1);
}

export function formatLearningDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(/\.$/, "");
}

export function courseToLearningDocument(
  course: LearningCourseInput,
): LearningDocument {
  const steps = course.steps.length;
  const isDraft = course.status === "DRAFT";
  const badge: LearningDocumentBadge | null = isDraft
    ? { label: "Черновик", tone: "gray" }
    : course.status === "ARCHIVED"
      ? { label: "Архив", tone: "gray" }
      : course.required
        ? { label: "Обязательный", tone: "green" }
        : null;

  return {
    id: course.id,
    kind: "COURSE",
    title: course.title,
    href: `/staff/learning/courses/${encodeURIComponent(course.id)}`,
    updatedAt: course.updatedAt,
    roleScope: course.roleScope,
    isDraft,
    requiredForMe: false,
    meta: `Курс · ${steps} ${plural(steps, "вкладка", "вкладки", "вкладок")} · ${formatLearningDate(course.updatedAt)}`,
    note: learningRoleScopeLabels[course.roleScope],
    noteTone: "muted",
    badge,
    thumbnail: courseThumbnail(course),
    searchText: [
      course.title,
      course.description ?? "",
      ...course.steps.map((step) => step.title),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

export function articleToLearningDocument(
  article: LearningArticleInput,
  now: Date = new Date(),
): LearningDocument {
  const reading = article.readingSummary;
  const toRead =
    article.status === "PUBLISHED" && reading.requiredByMe && !reading.readByMe;
  const isDraft = article.status === "DRAFT" || article.status === "RETURNED";
  const revisionOverdue =
    article.revisionDueAt !== null &&
    article.status === "PUBLISHED" &&
    new Date(article.revisionDueAt).getTime() < now.getTime();
  const badge: LearningDocumentBadge | null = toRead
    ? { label: "Прочитать", tone: "amber" }
    : article.status === "DRAFT"
      ? { label: "Черновик", tone: "gray" }
      : article.status === "RETURNED"
        ? { label: "На доработке", tone: "amber" }
        : article.status === "REVIEW"
          ? { label: "На согласовании", tone: "gray" }
          : article.status === "ARCHIVED"
            ? { label: "Архив", tone: "gray" }
            : revisionOverdue
              ? { label: "Пора обновить", tone: "amber" }
              : null;
  const note =
    article.requiresReading && reading.requiredCount > 0
      ? `Прочитали ${reading.readCount} из ${reading.requiredCount}`
      : learningRoleScopeLabels[article.roleScope];
  const label = article.kind === "INFORMATION" ? "Объявление · " : "";

  return {
    id: article.id,
    kind: "ARTICLE",
    title: article.title,
    href: `/staff/learning/articles/${encodeURIComponent(article.id)}`,
    updatedAt: article.updatedAt,
    roleScope: article.roleScope,
    isDraft,
    requiredForMe: toRead,
    meta: `${label}${article.folder} · ${formatLearningDate(article.updatedAt)}`,
    note,
    noteTone: toRead ? "attention" : "muted",
    badge,
    thumbnail: articleThumbnail(article),
    searchText: [article.title, article.summary ?? "", article.folder]
      .join(" ")
      .toLowerCase(),
  };
}

/** Newest first, the way a document list shows «Недавние». */
export function buildLearningDocuments(
  courses: LearningCourseInput[],
  articles: LearningArticleInput[],
  now: Date = new Date(),
) {
  return [
    ...courses.map(courseToLearningDocument),
    ...articles.map((article) => articleToLearningDocument(article, now)),
  ].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

export function filterLearningDocuments(
  documents: LearningDocument[],
  filter: LearningFilter,
  search: string,
) {
  const query = search.trim().toLowerCase();

  return documents.filter((document) => {
    if (filter === "courses" && document.kind !== "COURSE") {
      return false;
    }

    if (filter === "articles" && document.kind !== "ARTICLE") {
      return false;
    }

    if (filter === "drafts" && !document.isDraft) {
      return false;
    }

    if (filter === "to-read" && !document.requiredForMe) {
      return false;
    }

    return !query || document.searchText.includes(query);
  });
}

export function countLearningDocuments(documents: LearningDocument[]) {
  return {
    all: documents.length,
    courses: documents.filter((document) => document.kind === "COURSE").length,
    articles: documents.filter((document) => document.kind === "ARTICLE")
      .length,
    drafts: documents.filter((document) => document.isDraft).length,
    "to-read": documents.filter((document) => document.requiredForMe).length,
  } satisfies Record<LearningFilter, number>;
}

/* ------------------------------------------------------------------ */
/* Templates of the «Создать» row                                      */
/* ------------------------------------------------------------------ */

export type LearningCourseTemplate = {
  key: string;
  kind: "COURSE";
  name: string;
  hint: string;
  thumbnail: LearningThumbnailBlock[];
  course: {
    title: string;
    description: string | null;
    roleScope: LearningRoleScope;
    required: boolean;
    dueDays: number | null;
    steps: Array<{
      title: string;
      type: "TEXT" | "TASK";
      content: string;
    }>;
  };
};

export type LearningArticleTemplate = {
  key: string;
  kind: "ARTICLE";
  name: string;
  hint: string;
  thumbnail: LearningThumbnailBlock[];
  article: {
    title: string;
    summary: string | null;
    content: string;
    folder: string;
    category: string;
    roleScope: LearningRoleScope;
    templateKey: string | null;
  };
};

export type LearningTemplate = LearningCourseTemplate | LearningArticleTemplate;

function html(...blocks: string[]) {
  return blocks.join("");
}

export const learningTemplates: LearningTemplate[] = [
  {
    key: "blank-article",
    kind: "ARTICLE",
    name: "Пустой документ",
    hint: "статья базы знаний",
    thumbnail: [],
    article: {
      title: "Новый документ",
      summary: null,
      content: "",
      folder: "Общие",
      category: "Общие стандарты",
      roleScope: "ALL_STAFF",
      templateKey: null,
    },
  },
  {
    key: "blank-course",
    kind: "COURSE",
    name: "Пустой курс",
    hint: "документ с вкладками",
    thumbnail: [],
    course: {
      title: "Новый курс",
      description: null,
      roleScope: "ALL_STAFF",
      required: false,
      dueDays: null,
      steps: [
        {
          title: "Введение",
          type: "TEXT",
          content: "Коротко расскажите, чему научит курс и сколько он займёт.",
        },
      ],
    },
  },
  {
    key: "course-administrator-onboarding",
    kind: "COURSE",
    name: "Онбординг администратора",
    hint: "курс · 11 вкладок",
    thumbnail: [
      { kind: "title", text: "Онбординг администратора" },
      { kind: "tabs", text: "1 Добро пожаловать · 2 Регламент · 3 Langame" },
      {
        kind: "paragraph",
        text: "Пройди вкладки по порядку, чтобы начать работу администратором.",
      },
      { kind: "item", text: "Регламент и чек-лист смены" },
      { kind: "item", text: "Работа в Langame" },
      { kind: "item", text: "Тарифы и акции клуба" },
      { kind: "task", text: "Задание: продажа бара с наставником" },
    ],
    course: {
      title: "Онбординг администратора",
      description:
        "Всё, что нужно новому администратору, чтобы самостоятельно вести смену.",
      roleScope: "ADMINISTRATOR",
      required: true,
      dueDays: 7,
      steps: [
        {
          title: "Добро пожаловать",
          type: "TEXT",
          content:
            "Привет! Чтобы начать полноценную работу администратором, изучи процессы клуба и регламент работы. Проходи вкладки по порядку, вопросы задавай старшему администратору.",
        },
        {
          title: "Регламент и чек-листы смены",
          type: "TEXT",
          content:
            "Изучи регламент работы администратора, основной чек-лист смены и чек-лист чистоты.",
        },
        {
          title: "Работа в системе Langame",
          type: "TEXT",
          content:
            "Бронирование, администрирование зала, продажа бара и пополнение игрового счёта, инкассация, начисление баллов.",
        },
        {
          title: "Тарифы и акции клуба",
          type: "TEXT",
          content: "Изучи действующие тарифы, пакеты и акции клуба.",
        },
        {
          title: "Оприходование товара",
          type: "TEXT",
          content: "Как принять товар и добавить его в учёт Langame.",
        },
        {
          title: "Открытие и закрытие смены",
          type: "TEXT",
          content: "Порядок открытия и закрытия смены, пересчёт кассы.",
        },
        {
          title: "Общение с гостями",
          type: "TEXT",
          content:
            "Требования и инструкции по взаимодействию и общению с гостями.",
        },
        {
          title: "Бар: хот-доги и продажи",
          type: "TASK",
          content:
            "Под присмотром наставника приготовь хот-дог и продай барную продукцию гостю.",
        },
        {
          title: "Чистота клуба",
          type: "TEXT",
          content:
            "Уборка игровых мест, пополнение материалов в санузлах, вынос мусора, мытьё грилей.",
        },
        {
          title: "Безопасность",
          type: "TASK",
          content:
            "Покажи наставнику, где находятся пожарная сигнализация и тревожная кнопка, и расскажи, как ими пользоваться.",
        },
        {
          title: "Частые проблемы с компьютерами",
          type: "TEXT",
          content:
            "Самые частые технические проблемы с компьютерами и как их решать.",
        },
      ],
    },
  },
  {
    key: "course-senior-administrator",
    kind: "COURSE",
    name: "Старший администратор",
    hint: "курс · контроль смены",
    thumbnail: [
      { kind: "title", text: "Старший администратор" },
      { kind: "tabs", text: "1 Чек-листы · 2 Отклонения · 3 Пересменка" },
      {
        kind: "paragraph",
        text: "Чек-листы, контроль задач, бар и передача проблем управляющему.",
      },
      { kind: "item", text: "Проверка чек-листов смены" },
      { kind: "task", text: "Задание: разобрать отклонение" },
    ],
    course: {
      title: "Старший администратор: контроль смены",
      description:
        "Маршрут для старшей смены: чек-листы, контроль задач, бар и передача проблем управляющему.",
      roleScope: "SENIOR_ADMINISTRATOR",
      required: true,
      dueDays: 10,
      steps: [
        {
          title: "Проверить чек-листы смены",
          type: "TEXT",
          content:
            "Сверьте обязательные пункты открытия, пикового времени и закрытия смены.",
        },
        {
          title: "Разобрать отклонения",
          type: "TASK",
          content:
            "Зафиксируйте одно отклонение как задачу и назначьте ответственного.",
        },
        {
          title: "Пересменка",
          type: "TASK",
          content:
            "Проведите пересменку: касса, бар, открытые задачи и проблемы для управляющего.",
        },
      ],
    },
  },
  {
    key: "course-standards-manager",
    kind: "COURSE",
    name: "Менеджер по стандартам",
    hint: "курс · аттестация",
    thumbnail: [
      { kind: "title", text: "Аттестация по стандартам" },
      {
        kind: "paragraph",
        text: "Подготовка к проверке стандартов, регламентов и качества работы.",
      },
      { kind: "heading", text: "Что проверяем" },
      { kind: "item", text: "Регламент и чек-листы" },
      { kind: "task", text: "Задание: собрать материалы" },
    ],
    course: {
      title: "Менеджер по стандартам: аттестация",
      description:
        "Короткий курс для подготовки к проверке стандартов, регламентов и качества работы администраторов.",
      roleScope: "STANDARDS_MANAGER",
      required: false,
      dueDays: null,
      steps: [
        {
          title: "Собрать материалы аттестации",
          type: "TASK",
          content:
            "Выберите регламент, чек-лист и две статьи базы знаний, которые попадут в проверку.",
        },
      ],
    },
  },
  {
    key: "article-regulation",
    kind: "ARTICLE",
    name: "Регламент",
    hint: "статья",
    thumbnail: [
      { kind: "title", text: "Регламент работы" },
      { kind: "heading", text: "1. Общие положения" },
      { kind: "paragraph", text: "Обязанности и порядок работы в клубе." },
      { kind: "heading", text: "2. Начало смены" },
      { kind: "item", text: "Приёмка зала" },
      { kind: "item", text: "Касса и инкассация" },
    ],
    article: {
      title: "Регламент работы",
      summary: "Обязанности и порядок работы сотрудника в клубе.",
      content: html(
        "<h2>1. Общие положения</h2><p>Кого касается регламент и что в нём описано.</p>",
        "<h2>2. Начало смены</h2><ul><li>Приёмка зала</li><li>Касса</li></ul>",
        "<h2>3. Во время смены</h2><p>Работа с гостями и залом.</p>",
        "<h2>4. Закрытие смены</h2><ul><li>Инкассация</li><li>Отчёт управляющему</li></ul>",
      ),
      folder: "Регламенты",
      category: "Регламенты",
      roleScope: "ADMINISTRATOR",
      templateKey: "learning-regulation",
    },
  },
  {
    key: "article-guest-script",
    kind: "ARTICLE",
    name: "Скрипт общения",
    hint: "статья",
    thumbnail: [
      { kind: "title", text: "Скрипт общения с гостем" },
      { kind: "heading", text: "Гость пришёл впервые" },
      {
        kind: "paragraph",
        text: "«Добрый день! Вы у нас впервые? Расскажу про тарифы…»",
      },
      { kind: "heading", text: "Гость недоволен" },
    ],
    article: {
      title: "Скрипт общения с гостем",
      summary: "Что говорить гостю в типичных ситуациях.",
      content: html(
        "<h2>Гость пришёл впервые</h2><p>«Добрый день! Вы у нас впервые? Расскажу, как всё устроено и какие есть тарифы.»</p>",
        "<h2>Гость недоволен</h2><p>Выслушать, извиниться, предложить решение, позвать старшего, если нужно.</p>",
        "<h2>Гость спрашивает про акции</h2><p>Назвать действующие акции и предложить подходящую.</p>",
      ),
      folder: "Скрипты",
      category: "Сервис",
      roleScope: "ALL_STAFF",
      templateKey: "learning-guest-script",
    },
  },
  {
    key: "article-checklist",
    kind: "ARTICLE",
    name: "Чек-лист",
    hint: "статья",
    thumbnail: [
      { kind: "title", text: "Чек-лист уборки" },
      { kind: "item", text: "☐ Протереть игровые места" },
      { kind: "item", text: "☐ Пополнить санузлы" },
      { kind: "item", text: "☐ Вынести мусор" },
      { kind: "item", text: "☐ Помыть гриль" },
    ],
    article: {
      title: "Чек-лист",
      summary: "Пункты, которые нужно проверить.",
      content: html(
        "<ul><li>☐ Первый пункт</li><li>☐ Второй пункт</li><li>☐ Третий пункт</li></ul>",
      ),
      folder: "Чек-листы",
      category: "Чистота",
      roleScope: "ADMINISTRATOR",
      templateKey: "learning-checklist",
    },
  },
];

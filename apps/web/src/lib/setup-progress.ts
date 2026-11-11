// Owner's launch checklist on /dashboard (UX plan, step 2.6). The API
// answers yes/no per step from data the network already has.
export const setupStepKeys = [
  "langame",
  "clubs",
  "staff",
  "mission",
  "dailyReport",
] as const;

export type SetupStepKey = (typeof setupStepKeys)[number];

export type SetupProgress = {
  steps: Array<{ key: SetupStepKey; done: boolean }>;
  completed: number;
  total: number;
  hasData: boolean;
};

export const setupStepCopy: Record<
  SetupStepKey,
  { title: string; description: string; href: string; action: string }
> = {
  langame: {
    title: "Подключите Langame",
    description:
      "Ключ и адреса клубов в настройках: из Langame придут продажи, сеансы и гости.",
    href: "/settings",
    action: "Открыть настройки",
  },
  clubs: {
    title: "Проверьте клубы",
    description:
      "У каждого клуба своё название вместо «Компьютерный клуб 1» и адрес в Langame.",
    href: "/stores",
    action: "Открыть клубы",
  },
  staff: {
    title: "Пригласите сотрудников",
    description: "Администраторы и управляющие получат свой вход и права.",
    href: "/users",
    action: "Пригласить",
  },
  mission: {
    title: "Запустите первое задание",
    description:
      "Готовый шаблон, например «3 часа игры» или «Вторая игра за неделю».",
    href: "/gamification/missions/wizard",
    action: "Создать задание",
  },
  dailyReport: {
    title: "Получите отчёт за сутки",
    description:
      "Подключите бота в Telegram: каждое утро придут касса, смены, гости и бар.",
    href: "/settings",
    action: "Настроить отчёт",
  },
};

function isKnownStep(
  step: unknown,
): step is { key: SetupStepKey; done: boolean } {
  if (!step || typeof step !== "object") return false;
  const candidate = step as { key?: unknown; done?: unknown };
  return (
    setupStepKeys.includes(candidate.key as SetupStepKey) &&
    typeof candidate.done === "boolean"
  );
}

/**
 * Steps in display order. Keys a newer API may add are dropped; a known step
 * without a yes/no answer makes the whole answer unusable.
 */
export function normalizeSetupProgress(value: unknown): SetupProgress | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { steps?: unknown; hasData?: unknown };
  if (!Array.isArray(candidate.steps) || typeof candidate.hasData !== "boolean")
    return null;
  const done = new Map<SetupStepKey, boolean>();
  for (const step of candidate.steps) {
    const key = (step as { key?: unknown } | null)?.key;
    if (!setupStepKeys.includes(key as SetupStepKey)) continue;
    if (!isKnownStep(step)) return null;
    done.set(step.key, step.done);
  }
  const steps = setupStepKeys
    .filter((key) => done.has(key))
    .map((key) => ({ key, done: done.get(key) === true }));
  if (steps.length === 0) return null;
  return {
    steps,
    completed: steps.filter((step) => step.done).length,
    total: steps.length,
    hasData: candidate.hasData,
  };
}

/** True while the checklist should stay on the dashboard. */
export function setupChecklistVisible(progress: SetupProgress | null) {
  return progress !== null && progress.completed < progress.total;
}

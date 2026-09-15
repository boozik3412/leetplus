export type UserCallStatus = "PENDING" | "CONFIRMED" | "EXPIRED" | "FAILED";

export type UserCallFeedbackInput = {
  status: UserCallStatus;
  expiresAt: string;
  now: number;
  pollError?: string | null;
  statusMessage?: string | null;
};

export type UserCallFeedback = {
  remainingSeconds: number | null;
  canCall: boolean;
  title: string;
  message: string;
  tone: "pending" | "error" | "expired" | "confirmed";
};

export function getUserCallRemainingSeconds(
  expiresAt: string,
  now: number,
): number | null {
  const expiresAtMs = Date.parse(expiresAt);

  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(now)) {
    return null;
  }

  return Math.ceil(Math.max(0, expiresAtMs - now) / 1000);
}

export function formatUserCallRemaining(seconds: number): string {
  const wholeSeconds = Number.isFinite(seconds)
    ? Math.max(0, Math.floor(seconds))
    : 0;
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds,
  ).padStart(2, "0")}`;
}

export function getUserCallFeedback({
  status,
  expiresAt,
  now,
  pollError,
  statusMessage,
}: UserCallFeedbackInput): UserCallFeedback {
  const remainingSeconds = getUserCallRemainingSeconds(expiresAt, now);

  if (status === "CONFIRMED") {
    return {
      remainingSeconds,
      canCall: false,
      title: "Звонок подтверждён",
      message: "Номер подтверждён. Вход продолжается автоматически.",
      tone: "confirmed",
    };
  }

  if (status === "EXPIRED" || remainingSeconds === 0) {
    return {
      remainingSeconds: 0,
      canCall: false,
      title: "Время на звонок истекло",
      message: "Этот вход по звонку больше не действует. Создайте новый вход.",
      tone: "expired",
    };
  }

  if (remainingSeconds === null) {
    return {
      remainingSeconds: null,
      canCall: false,
      title: "Не удалось проверить срок звонка",
      message: "Не удалось определить срок действия входа по звонку. Создайте новый вход.",
      tone: "error",
    };
  }

  if (status === "FAILED") {
    return {
      remainingSeconds,
      canCall: false,
      title: "Не удалось подтвердить звонок",
      message: "Этот вход по звонку не подтверждён. Создайте новый вход и попробуйте ещё раз.",
      tone: "error",
    };
  }

  if (pollError || statusMessage?.startsWith("Проверка звонка временно недоступна")) {
    return {
      remainingSeconds,
      canCall: true,
      title: "Не удалось проверить звонок",
      message:
        "Подтверждение пока не получено. Страница повторяет проверку автоматически.",
      tone: "error",
    };
  }

  return {
    remainingSeconds,
    canCall: true,
    title: "Ожидаем звонок",
    message:
      "Позвоните на указанный номер с выбранного телефона. После проверки вход продолжится автоматически.",
    tone: "pending",
  };
}

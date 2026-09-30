export type LangameSyncStatus = "SUCCESS" | "PARTIAL" | "FAILED";

export type LangameSyncStep = {
  component:
    | "PRODUCTS"
    | "CATEGORIES"
    | "CONFIGURATION"
    | "INVENTORY"
    | "SALES"
    | "REVENUE"
    | "CLUBS";
  status: "SUCCESS" | "FAILED";
  message: string;
  clubId?: string;
  count?: number;
  /** The network's API key has no access to this section. */
  limited?: true;
};

export type LangameSyncSourceResult = {
  domain: string;
  status: LangameSyncStatus;
  errorMessage: string | null;
  steps?: LangameSyncStep[];
};

const providerPartialMessagePrefix =
  /^(?:LANGAME_SYNC_PARTIAL|LANGAME_SYNC_UNAVAILABLE|LANGAME_SYNC_LIMITED):\s*/u;
const providerLimitedMessagePrefix = /^LANGAME_SYNC_LIMITED:\s*/u;

/** A complete import that skipped sections the API key has no access to. */
export function isLangameSyncLimitedMessage(
  message: string | null | undefined,
) {
  return Boolean(message && providerLimitedMessagePrefix.test(message));
}
const discrepancyAuditMessagePrefix =
  /^LANGAME_DISCREPANCY_AUDIT_WRITE_FAILED:\s*/u;

export function langameSyncStatusLabel(status: string) {
  if (status === "SUCCESS") {
    return "Успешно";
  }

  if (status === "PARTIAL") {
    return "Частично";
  }

  if (status === "FAILED") {
    return "Ошибка";
  }

  if (status === "RUNNING") {
    return "Выполняется";
  }

  if (status === "UNKNOWN") {
    return "Статус уточняется";
  }

  return status;
}

export function langameSyncCompletionMessage({
  failedSources,
  partialSources,
}: {
  failedSources: number;
  partialSources: number;
}) {
  if (failedSources > 0) {
    return "Синхронизация завершилась с ошибками по отдельным источникам. Проверьте комментарии по источникам; уже сохранённые данные не удалены.";
  }

  if (partialSources > 0) {
    return "Синхронизация завершилась частично. Доступные разделы загружены; проверьте комментарии по источникам ниже.";
  }

  return null;
}

export function langameSyncMessage(message: string | null | undefined) {
  if (!message) {
    return null;
  }

  if (discrepancyAuditMessagePrefix.test(message)) {
    return `Данные загружены, но файл расхождений не записан: ${message.replace(
      discrepancyAuditMessagePrefix,
      "",
    )}`;
  }

  return message.replace(providerPartialMessagePrefix, "");
}

export function langameSyncStepStatusLabel({
  status,
  count,
  limited,
}: Pick<LangameSyncStep, "status" | "count" | "limited">) {
  if (status === "SUCCESS") {
    return "загружено";
  }

  if (limited) {
    return "нет доступа по ключу API";
  }

  return typeof count === "number" && count > 0 ? "частично" : "не загружено";
}

export function langameSyncComponentLabel(
  component: LangameSyncStep["component"],
) {
  const labels: Record<LangameSyncStep["component"], string> = {
    PRODUCTS: "Товары",
    CATEGORIES: "Категории",
    CONFIGURATION: "Конфигурация",
    INVENTORY: "Остатки",
    SALES: "Продажи",
    REVENUE: "Выручка",
    CLUBS: "Клубы",
  };

  return labels[component];
}

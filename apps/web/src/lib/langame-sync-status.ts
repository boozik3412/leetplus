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
};

export type LangameSyncSourceResult = {
  domain: string;
  status: LangameSyncStatus;
  errorMessage: string | null;
  steps?: LangameSyncStep[];
};

const providerPartialMessagePrefix =
  /^(?:LANGAME_SYNC_PARTIAL|LANGAME_SYNC_UNAVAILABLE):\s*/u;
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
}: Pick<LangameSyncStep, "status" | "count">) {
  if (status === "SUCCESS") {
    return "загружено";
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

export type DailyReportCommentary =
  | { status: "OK"; text: string; model: string }
  | {
      status: "DISABLED" | "FAILED" | "REJECTED";
      text: null;
      reason: string;
    };

export type DailyReportPreview = {
  report: {
    generatedAt: string;
    clubs: Array<{ storeId: string; name: string; reportDate: string }>;
    alerts: string[];
  };
  commentary: DailyReportCommentary | null;
  messages: string[];
};

export type DailyReportSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
};

const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
};

/**
 * Splits a Telegram HTML message into plain text segments. Only <b> and <i>
 * are formatting; everything else stays text, so the page renders the
 * message as React text nodes and never injects HTML.
 */
export function parseTelegramHtml(message: string): DailyReportSegment[] {
  const segments: DailyReportSegment[] = [];
  let bold = false;
  let italic = false;
  message.split(/(<\/?[bi]>)/).forEach((part) => {
    if (part === "<b>") bold = true;
    else if (part === "</b>") bold = false;
    else if (part === "<i>") italic = true;
    else if (part === "</i>") italic = false;
    else if (part) {
      segments.push({
        text: part.replace(/&(?:lt|gt|amp);/g, (entity) => ENTITIES[entity]),
        bold,
        italic,
      });
    }
  });
  return segments;
}

export function commentaryStatusText(commentary: DailyReportCommentary | null) {
  if (!commentary || commentary.status === "OK") return null;
  if (commentary.status === "DISABLED") {
    return "Разбор ИИ не настроен: на сервере не задан ключ Cloud.ru.";
  }
  if (commentary.status === "REJECTED") {
    return "Модель назвала цифры, которых нет в отчёте, поэтому разбор не показан. Цифры отчёта верные.";
  }
  return "Не удалось получить разбор ИИ. Цифры отчёта верные, попробуйте позже.";
}

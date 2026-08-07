export const hourlySessionSourceNotice =
  "Учитывается только полная сессия (продление с изменением типа сессии не учитывается).";

const legacyHourlySessionSourceNotices = [
  "Продление пакета или абонемента без завершения сессии не засчитывается.",
  "Почасовой тип подтверждается только для отдельно начатой почасовой сессии. Продление пакета или абонемента без завершения текущей сессии Langame не передаёт как отдельный тарифный сегмент, поэтому такое продление не засчитывается.",
] as const;

export function appendHourlySessionSourceNotice(label: string, enabled = true) {
  if (!enabled) {
    return label;
  }

  const normalized = legacyHourlySessionSourceNotices
    .reduce((value, notice) => value.replace(notice, ""), label)
    .trim();
  if (normalized.includes(hourlySessionSourceNotice)) {
    return normalized;
  }

  return `${normalized}${/[.!?]$/.test(normalized) ? "" : "."} ${hourlySessionSourceNotice}`;
}

export function HourlySessionSourceNote() {
  return (
    <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
      {hourlySessionSourceNotice}
    </p>
  );
}

export const hourlySessionSourceNotice =
  "Почасовой тип подтверждается только для отдельно начатой почасовой сессии. Продление пакета или абонемента без завершения текущей сессии Langame не передаёт как отдельный тарифный сегмент, поэтому такое продление не засчитывается.";

export function HourlySessionSourceNote() {
  return (
    <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
      {hourlySessionSourceNotice}
    </p>
  );
}

const legalEntityRows = [
  ["Оператор сайта", 'ООО "ЛИТ"'],
  ["ОГРН", "1231800017063"],
  ["ИНН", "1800006677"],
  ["КПП", "180001001"],
] as const;

type LegalEntityInfoProps = {
  className?: string;
  compact?: boolean;
};

export function LegalEntityInfo({
  className = "",
  compact = false,
}: LegalEntityInfoProps) {
  return (
    <footer
      aria-label="Юридическая информация"
      className={[
        "border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <dt className="sr-only">Раздел</dt>
          <dd className="font-medium text-zinc-600">
            {compact ? "Реквизиты" : "Юридическая информация"}
          </dd>
        </div>
        {legalEntityRows.map(([label, value]) => (
          <div className="flex items-center gap-1 whitespace-nowrap" key={label}>
            <dt>{label}:</dt>
            <dd className="font-medium text-zinc-600">{value}</dd>
          </div>
        ))}
      </dl>
    </footer>
  );
}

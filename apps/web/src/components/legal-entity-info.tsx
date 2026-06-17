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
    <section
      aria-labelledby="legal-entity-title"
      className={[
        "rounded-lg border border-zinc-200 bg-white p-4 text-zinc-950 shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div>
        <h2 id="legal-entity-title" className="text-sm font-semibold">
          Юридическая информация
        </h2>
        {!compact ? (
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Сайт LeetPlus принадлежит юридическому лицу, указанному ниже.
          </p>
        ) : null}
      </div>

      <dl className="mt-3 grid gap-2 text-sm">
        {legalEntityRows.map(([label, value]) => (
          <div
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
            key={label}
          >
            <dt className="text-zinc-500">{label}</dt>
            <dd className="font-semibold text-zinc-950">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

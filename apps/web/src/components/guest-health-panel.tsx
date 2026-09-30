import type { GuestListFilters, GuestsHealthSummary } from "@/lib/guests";
import {
  churnRiskLabels,
  churnTone,
  consentLabels,
  consentTone,
  crmStatusLabels,
  crmStatusTone,
  formatRubles,
  guestListAnchorHref,
  rfmSegmentLabels,
  rfmTone,
} from "@/lib/guest-insights";
import {
  DistributionBars,
  InsightBadge,
  InsightCard,
  InsightCardHeader,
} from "@/components/guest-insight-ui";

type Scope = Pick<
  GuestListFilters,
  "dateFrom" | "dateTo" | "storeId" | "guestGroupId"
>;

export function GuestHealthPanel({
  health,
  scope,
}: {
  health: GuestsHealthSummary;
  scope: Scope;
}) {
  const listHref = (filters: Partial<GuestListFilters>) =>
    guestListAnchorHref({ ...scope, ...filters, page: "1", pageSize: "50" });

  return (
    <InsightCard>
      <InsightCardHeader
        eyebrow="Здоровье базы"
        title="RFM, риск оттока и право на связь"
        description="RFM считается по давности, частоте и деньгам за период (баллы 1–5). Риск оттока сравнивает паузу с обычным ритмом визитов гостя. Нажмите на строку, чтобы открыть список."
      />
      <div className="grid gap-6 p-5 lg:grid-cols-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            RFM-сегменты
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Доля гостей и доля денег периода
          </p>
          <div className="mt-3">
            <DistributionBars
              rows={health.rfm.map((entry) => ({
                key: entry.segment,
                label: rfmSegmentLabels[entry.segment],
                value: entry.guests,
                percent: entry.guestsPercent,
                tone: rfmTone(entry.segment),
                hint: `${entry.revenuePercent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} % денег · ${formatRubles(entry.revenue)}`,
                href: listHref({ rfm: entry.segment, sort: "rfm" }),
              }))}
            />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Риск оттока
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Деньги периода под риском по уровням
          </p>
          <div className="mt-3">
            <DistributionBars
              rows={health.churn.map((entry) => ({
                key: entry.level,
                label: churnRiskLabels[entry.level],
                value: entry.guests,
                percent: entry.guestsPercent,
                tone: churnTone(entry.level),
                hint:
                  entry.valueAtRisk > 0
                    ? `под риском ${formatRubles(entry.valueAtRisk)}`
                    : undefined,
                href: listHref({ churnRisk: entry.level, sort: "churnRisk" }),
              }))}
            />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Согласие на коммуникации
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Кому можно писать и звонить
          </p>
          <div className="mt-3">
            <DistributionBars
              rows={health.consent.map((entry) => ({
                key: entry.status,
                label: consentLabels[entry.status],
                value: entry.guests,
                percent: entry.guestsPercent,
                tone: consentTone(entry.status),
                href: listHref({ consent: entry.status }),
              }))}
            />
          </div>
          {health.crm.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                CRM-статусы
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {health.crm.map((entry) => (
                  <a
                    key={entry.status}
                    href={listHref({ crmStatus: entry.status })}
                    className="inline-flex"
                  >
                    <InsightBadge tone={crmStatusTone(entry.status)}>
                      {crmStatusLabels[entry.status]} · {entry.guests}
                    </InsightBadge>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </InsightCard>
  );
}

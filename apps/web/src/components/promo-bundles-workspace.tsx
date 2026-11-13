"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check } from "@phosphor-icons/react";
import { GuestGroupBuilder } from "@/components/guest-group-builder";
import {
  MarketingPromoBundleUsageWorkspace,
  buildPromoBundleConfig,
  buildPromoBundleEconomics,
  buildPromoBundleNote,
  buildPromoBundleVerdict,
  emptyBundleDraft,
  promoBundleToDraft,
  readError,
  type PromoBundleDraft,
  type PromoBundleType,
} from "@/components/marketing-campaigns-panel";
import { MoreFields } from "@/components/more-fields";
import type { GuestAudience } from "@/lib/guests";
import type {
  MarketingPromoBundle,
  MarketingPromoBundleLaunch,
  MarketingPromoBundleReconciliation,
  MarketingPromoBundleUsage,
  MarketingTariffConditionItem,
  MarketingTariffConditions,
} from "@/lib/marketing";
import type { Product } from "@/lib/products";
import {
  checkPromoBundlePrice,
  pluralRu,
  promoBundleCardState,
  promoBundleKind,
  promoBundleKinds,
  promoBundleLaunchSummary,
  promoBundleOfferLine,
  promoBundleTemplate,
  promoBundleTemplates,
  promoBundleWizardSteps,
  suggestedGuestPrice,
  type PromoBundleAudienceMode,
  type PromoBundleCardState,
  type PromoBundlePartKind,
  type PromoBundleWizardStep,
} from "@/lib/promo-bundle-wizard";
import type { Store } from "@/lib/stores";

export type PromoBundlesView = "list" | "usage" | "wizard";

const basePath = "/marketing/promo-bundles";

type WorkspaceProps = {
  view: PromoBundlesView;
  editId: string | null;
  usageBundleId: string | null;
  initialStep: PromoBundleWizardStep | null;
  promoBundles: MarketingPromoBundle[];
  promoBundleLaunches: MarketingPromoBundleLaunch[];
  promoBundleUsages: MarketingPromoBundleUsage[];
  promoBundleReconciliation: MarketingPromoBundleReconciliation[];
  products: Product[];
  tariffConditions: MarketingTariffConditions;
  stores: Store[];
  audiences: GuestAudience[];
};

export function PromoBundlesWorkspace(props: WorkspaceProps) {
  const router = useRouter();

  if (props.view === "wizard") {
    const bundle =
      props.promoBundles.find((item) => item.id === props.editId) ?? null;

    return (
      <PromoBundleWizard
        key={bundle?.id ?? "new"}
        bundle={bundle}
        initialStep={props.initialStep}
        launches={props.promoBundleLaunches}
        products={props.products}
        tariffConditions={props.tariffConditions}
        stores={props.stores}
        audiences={props.audiences}
      />
    );
  }

  return (
    <section className="grid gap-5">
      <PromoBundlesHeader />
      <nav
        aria-label="Разделы промо-наборов"
        className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        <TabLink href={basePath} active={props.view === "list"}>
          Наборы · {props.promoBundles.length}
        </TabLink>
        <TabLink href={`${basePath}?tab=usage`} active={props.view === "usage"}>
          Использования и учёт
        </TabLink>
      </nav>
      {props.view === "usage" ? (
        <MarketingPromoBundleUsageWorkspace
          promoBundles={props.promoBundles}
          promoBundleLaunches={props.promoBundleLaunches}
          promoBundleUsages={props.promoBundleUsages}
          promoBundleReconciliation={props.promoBundleReconciliation}
          stores={props.stores}
          initialBundleId={props.usageBundleId}
          onEditBundle={(bundle) =>
            router.push(`${basePath}?edit=${encodeURIComponent(bundle.id)}`)
          }
        />
      ) : (
        <PromoBundleCards
          promoBundles={props.promoBundles}
          launches={props.promoBundleLaunches}
          usages={props.promoBundleUsages}
          stores={props.stores}
        />
      )}
    </section>
  );
}

function PromoBundlesHeader() {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold text-zinc-950 dark:text-white">
            Промо-наборы
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Готовое предложение для гостей: что гость получает, сколько платит и
            на каких условиях. Администратор отмечает использование на кассе, а
            здесь видно, сколько наборов взяли и сколько они принесли.
          </p>
        </div>
        <Link
          href={`${basePath}?view=new`}
          className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          Создать промо-набор
        </Link>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {[
          [
            "Соберите предложение",
            "Игра, товар из ассортимента или бонус. Цена товара подставится сама.",
          ],
          [
            "Выберите, кому и где",
            "Всем гостям, группе гостей или как награда в игровом задании.",
          ],
          [
            "Отмечайте использования",
            "Кнопка на карточке набора. Так видно, сколько наборов взяли.",
          ],
        ].map(([title, text], index) => (
          <li
            key={title}
            className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-100 text-sm font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
              {index + 1}
            </span>
            <span>
              <strong className="block text-sm text-zinc-950 dark:text-white">
                {title}
              </strong>
              <span className="mt-1 block text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                {text}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
        active
          ? "border-emerald-500 text-zinc-950 dark:text-white"
          : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Catalog cards

function PromoBundleCards({
  promoBundles,
  launches,
  usages,
  stores,
}: {
  promoBundles: MarketingPromoBundle[];
  launches: MarketingPromoBundleLaunch[];
  usages: MarketingPromoBundleUsage[];
  stores: Store[];
}) {
  const [now] = useState(() => new Date());
  const [showArchived, setShowArchived] = useState(false);
  const rows = useMemo(
    () =>
      promoBundles.map((bundle) => ({
        bundle,
        state: promoBundleCardState({
          bundleId: bundle.id,
          bundleStatus: bundle.status,
          launches,
          usages,
          now,
        }),
      })),
    [launches, now, promoBundles, usages],
  );
  const visible = rows.filter(
    (row) => showArchived || row.state.status !== "archived",
  );
  const archivedCount =
    rows.length - rows.filter((row) => row.state.status !== "archived").length;

  if (promoBundles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm leading-6 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
        <p className="font-semibold text-zinc-950 dark:text-white">
          Промо-наборов пока нет
        </p>
        <p className="mt-1">
          Начните с шаблона: «Вернуть ушедших», «Загрузить тихие часы» или
          «Поднять бар». Это займёт пару минут.
        </p>
        <Link
          href={`${basePath}?view=new`}
          className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
        >
          Создать промо-набор
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map(({ bundle, state }) => (
          <PromoBundleCard
            key={bundle.id}
            bundle={bundle}
            state={state}
            storeCount={stores.length}
          />
        ))}
      </div>
      {archivedCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowArchived((value) => !value)}
          className="w-fit cursor-pointer text-sm font-semibold text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          {showArchived
            ? "Скрыть наборы в архиве"
            : `Показать наборы в архиве (${archivedCount})`}
        </button>
      ) : null}
    </div>
  );
}

const cardStatusClass: Record<PromoBundleCardState["status"], string> = {
  running:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  scheduled:
    "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
  not_launched:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  finished:
    "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  archived:
    "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
};

function PromoBundleCard({
  bundle,
  state,
  storeCount,
}: {
  bundle: MarketingPromoBundle;
  state: PromoBundleCardState;
  storeCount: number;
}) {
  const draft = promoBundleToDraft(bundle);
  const economics = buildPromoBundleEconomics(draft);
  const launch = state.launch;
  const maxUses = launch?.maxUses ?? null;
  const progress =
    maxUses && maxUses > 0 ? Math.min(100, (state.used / maxUses) * 100) : null;
  const editHref = `${basePath}?edit=${encodeURIComponent(bundle.id)}`;

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-base font-semibold text-zinc-950 [overflow-wrap:anywhere] dark:text-white">
          {bundle.name}
        </h2>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cardStatusClass[state.status]}`}
        >
          {state.label}
        </span>
      </div>
      <div>
        <p className="text-sm text-zinc-700 dark:text-zinc-200">
          {promoBundleOfferLine(draft.gameItem, draft.barItems)}
        </p>
        <p className="mt-1 tabular-nums">
          <strong className="text-xl text-zinc-950 dark:text-white">
            {rub(economics.promoPrice)}
          </strong>
          {economics.basePrice > economics.promoPrice ? (
            <>
              {" "}
              <span className="text-sm text-zinc-500 line-through dark:text-zinc-400">
                {rub(economics.basePrice)}
              </span>{" "}
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                выгода {rub(economics.basePrice - economics.promoPrice)}
              </span>
            </>
          ) : null}
        </p>
      </div>
      {launch ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Кому и где">
          {promoBundleLaunchSummary(launch, storeCount).map((item) => (
            <li
              key={item}
              className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {state.status === "not_launched" ? (
        <p className="text-sm leading-5 text-amber-800 dark:text-amber-200">
          Набор собран, но гости его пока не получают. Выберите, кому и где он
          действует.
        </p>
      ) : (
        <div className="tabular-nums">
          <div className="flex justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span>
              Взяли {state.used}
              {maxUses ? ` из ${maxUses}` : ""}
            </span>
            <span>принёс {rub(state.revenue)}</span>
          </div>
          {progress !== null ? (
            <div
              className="mt-1.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800"
              aria-hidden
            >
              <div
                className="h-1.5 rounded-full bg-emerald-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {state.status === "not_launched" || state.status === "finished" ? (
          <Link
            href={`${editHref}&step=who`}
            className="inline-flex min-h-10 items-center rounded-xl bg-emerald-500 px-3.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            {state.status === "finished" ? "Запустить снова" : "Выбрать, кому"}
          </Link>
        ) : state.status !== "archived" ? (
          <Link
            href={`${basePath}?tab=usage&bundle=${encodeURIComponent(bundle.id)}`}
            className="inline-flex min-h-10 items-center rounded-xl bg-emerald-500 px-3.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            Отметить использование
          </Link>
        ) : null}
        <Link
          href={editHref}
          className="inline-flex min-h-10 items-center rounded-xl border border-zinc-300 px-3.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Открыть
        </Link>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Wizard

type WizardForm = {
  draft: PromoBundleDraft;
  name: string;
  templateId: string | null;
  guestPrice: string;
  costOverride: string;
  validityOn: boolean;
  minSpendOn: boolean;
  tariffOn: boolean;
  audienceMode: PromoBundleAudienceMode;
  audienceId: string;
  storeScope: "NETWORK" | "STORES";
  storeIds: string[];
  periodFrom: string;
  periodTo: string;
  maxUses: string;
};

function dateInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function blankDraft(type: PromoBundleType): PromoBundleDraft {
  const kind = promoBundleKind(type);

  return {
    ...emptyBundleDraft,
    bundleType: type,
    gameItem: "",
    barItems: "",
    gamePrice: "",
    barPrice: "",
    servicePrice: "0",
    discount: "0",
    cost: "0",
    serviceItems: "",
    requiresApproval: false,
    firstAccountingKind: accountingKindForPart(kind.parts[0]),
    firstAccountingProductId: "",
    firstAccountingReference: "",
    secondAccountingKind: accountingKindForPart(kind.parts[1]),
    secondAccountingProductId: "",
    secondAccountingReference: "",
    writeOffRule: "ON_REDEEM",
  };
}

function accountingKindForPart(part: PromoBundlePartKind) {
  return part === "product"
    ? "PRODUCT"
    : part === "bonus"
      ? "BONUS"
      : "SERVICE";
}

function initialWizardForm(
  bundle: MarketingPromoBundle | null,
  launches: MarketingPromoBundleLaunch[],
): WizardForm {
  const today = new Date();
  const monthLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const base = {
    templateId: null,
    costOverride: "",
    audienceMode: "ALL" as PromoBundleAudienceMode,
    audienceId: "",
    storeScope: "NETWORK" as const,
    storeIds: [],
    periodFrom: dateInput(today),
    periodTo: dateInput(monthLater),
  };

  if (!bundle) {
    const draft = blankDraft("game_product");

    return {
      ...base,
      draft,
      name: "",
      guestPrice: "",
      validityOn: true,
      minSpendOn: false,
      tariffOn: false,
      maxUses: "50",
    };
  }

  const draft = promoBundleToDraft(bundle);
  const economics = buildPromoBundleEconomics(draft);
  const previous = launches
    .filter((launch) => launch.promoBundle.id === bundle.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

  return {
    ...base,
    draft,
    name: bundle.name,
    guestPrice: economics.promoPrice > 0 ? String(economics.promoPrice) : "",
    costOverride: String(parseNumber(draft.cost) || ""),
    validityOn: parseNumber(draft.validityDays) > 0,
    minSpendOn: parseNumber(draft.minSpend) > 0,
    tariffOn: Boolean(
      draft.tariffGroupId || draft.tariffPeriodId || draft.tariffTypeId,
    ),
    audienceMode: previous?.audience ? "GROUP" : "ALL",
    audienceId: previous?.audience?.id ?? "",
    storeScope: previous && previous.storeIds.length > 0 ? "STORES" : "NETWORK",
    storeIds: previous?.storeIds ?? [],
    maxUses: String(
      previous?.maxUses ?? (parseNumber(draft.expectedUses) || 50),
    ),
  };
}

function parseNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(
    String(value ?? "")
      .replace(/\s/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function rub(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function productCost(product: Product) {
  if (product.unitCost !== null && product.unitCost > 0) {
    return product.unitCost;
  }

  return parseNumber(product.purchasePrice);
}

function PromoBundleWizard({
  bundle,
  initialStep,
  launches,
  products,
  tariffConditions,
  stores,
  audiences,
}: {
  bundle: MarketingPromoBundle | null;
  initialStep: PromoBundleWizardStep | null;
  launches: MarketingPromoBundleLaunch[];
  products: Product[];
  tariffConditions: MarketingTariffConditions;
  stores: Store[];
  audiences: GuestAudience[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<PromoBundleWizardStep>(
    initialStep ?? "what",
  );
  const [form, setForm] = useState<WizardForm>(() =>
    initialWizardForm(bundle, launches),
  );
  const [audienceRows, setAudienceRows] = useState(audiences);
  const [groupBuilderOpen, setGroupBuilderOpen] = useState(false);
  const [saving, setSaving] = useState<null | "draft" | "launch">(null);
  const [error, setError] = useState<string | null>(null);
  const [launchRows, setLaunchRows] = useState(launches);
  const [stoppingLaunchId, setStoppingLaunchId] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  const kind = promoBundleKind(form.draft.bundleType);
  const activeProducts = useMemo(
    () => products.filter((product) => product.isActive),
    [products],
  );
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const firstPrice = parseNumber(form.draft.gamePrice);
  const secondPrice = parseNumber(form.draft.barPrice);
  const basePrice = firstPrice + secondPrice;
  const autoCost = useMemo(() => {
    let cost = 0;
    kind.parts.forEach((part, index) => {
      const productId =
        index === 0
          ? form.draft.firstAccountingProductId
          : form.draft.secondAccountingProductId;
      const price = index === 0 ? firstPrice : secondPrice;
      if (part === "product") {
        const product = productById.get(productId);
        cost += product ? productCost(product) : 0;
      } else if (part === "bonus") {
        cost += price;
      }
    });
    return cost;
  }, [
    firstPrice,
    form.draft.firstAccountingProductId,
    form.draft.secondAccountingProductId,
    kind.parts,
    productById,
    secondPrice,
  ]);
  const costPerUse =
    form.costOverride.trim() !== "" ? parseNumber(form.costOverride) : autoCost;
  const guestPrice = parseNumber(form.guestPrice);
  const isTopUp = kind.parts[0] === "topup";
  const priceCheck = checkPromoBundlePrice({
    basePrice,
    guestPrice,
    costPerUse,
    kind: kind.id,
  });
  const currentLaunches = launchRows.filter(
    (launch) =>
      bundle &&
      launch.promoBundle.id === bundle.id &&
      launch.status === "ACTIVE" &&
      (!launch.periodTo ||
        new Date(launch.periodTo).getTime() + 24 * 60 * 60 * 1000 >
          now.getTime()),
  );
  const template = promoBundleTemplate(form.templateId);
  const offerLine = promoBundleOfferLine(
    form.draft.gameItem,
    form.draft.barItems,
  );
  const hasComposition = Boolean(
    form.draft.gameItem.trim() || form.draft.barItems.trim(),
  );
  const suggestedName =
    form.name.trim() ||
    template?.name ||
    (hasComposition ? offerLine.slice(0, 80) : "");

  function updateDraft(patch: Partial<PromoBundleDraft>) {
    setForm((current) => ({
      ...current,
      draft: { ...current.draft, ...patch },
    }));
  }

  function chooseKind(type: PromoBundleType) {
    setForm((current) => ({
      ...current,
      templateId: null,
      draft: {
        ...blankDraft(type),
        onePerGuest: current.draft.onePerGuest,
        noStacking: current.draft.noStacking,
        requiresApproval: current.draft.requiresApproval,
        validityDays: current.draft.validityDays,
      },
      guestPrice: "",
    }));
  }

  function applyTemplate(id: string) {
    const next = promoBundleTemplate(id);
    if (!next) return;

    setForm((current) => ({
      ...current,
      templateId: next.id,
      name: next.name,
      guestPrice: "",
      audienceMode: next.audienceMode,
      validityOn: next.validityDays > 0,
      draft: {
        ...blankDraft(next.kind),
        gameItem: next.first,
        gamePrice: next.firstPrice ? String(next.firstPrice) : "",
        barItems: next.second,
        barPrice: next.secondPrice ? String(next.secondPrice) : "",
        onePerGuest: next.onePerGuest,
        noStacking: next.noStacking,
        requiresApproval: false,
        validityDays: String(next.validityDays || 7),
        serviceItems: next.extraCondition,
      },
    }));
  }

  function choosePartProduct(index: 0 | 1, product: Product | null) {
    const price = product ? String(parseNumber(product.salePrice) || "") : "";
    updateDraft(
      index === 0
        ? {
            firstAccountingProductId: product?.id ?? "",
            gameItem: product?.name ?? "",
            gamePrice: price,
          }
        : {
            secondAccountingProductId: product?.id ?? "",
            barItems: product?.name ?? "",
            barPrice: price,
          },
    );
  }

  function goTo(next: PromoBundleWizardStep) {
    if (next === "price" && !form.guestPrice && basePrice > 0) {
      const percent = template?.discountPercent ?? 20;
      setForm((current) => ({
        ...current,
        guestPrice: String(
          suggestedGuestPrice(
            current.draft.bundleType,
            firstPrice,
            secondPrice,
            percent,
          ),
        ),
      }));
    }
    setError(null);
    setStep(next);
  }

  const stepIssue: Record<PromoBundleWizardStep, string | null> = {
    what: (() => {
      for (const index of [0, 1] as const) {
        const part = kind.parts[index];
        const label = kind.labels[index];
        const text = index === 0 ? form.draft.gameItem : form.draft.barItems;
        const price = index === 0 ? firstPrice : secondPrice;
        const productId =
          index === 0
            ? form.draft.firstAccountingProductId
            : form.draft.secondAccountingProductId;
        if (part === "product" && !productId) {
          return `Выберите товар: «${label}».`;
        }
        if (!text.trim()) {
          return `Опишите часть «${label}».`;
        }
        if (price <= 0) {
          return `Укажите обычную цену части «${label}».`;
        }
      }
      return null;
    })(),
    price: priceCheck.tone === "blocked" ? priceCheck.detail : null,
    rules: null,
    who:
      form.audienceMode === "GROUP" && !form.audienceId
        ? "Выберите группу гостей или соберите новую."
        : form.audienceMode !== "GAME" &&
            form.storeScope === "STORES" &&
            form.storeIds.length === 0
          ? "Отметьте хотя бы один клуб."
          : form.audienceMode !== "GAME" && parseNumber(form.maxUses) <= 0
            ? "Укажите, сколько наборов можно выдать."
            : form.audienceMode !== "GAME" &&
                form.periodFrom &&
                form.periodTo &&
                form.periodTo < form.periodFrom
              ? "Дата окончания раньше даты начала."
              : null,
  };
  const stepIndex = promoBundleWizardSteps.findIndex(
    (item) => item.id === step,
  );
  const stepDone = (id: PromoBundleWizardStep) =>
    promoBundleWizardSteps.findIndex((item) => item.id === id) < stepIndex &&
    !stepIssue[id];

  function buildDraftForSave(): PromoBundleDraft {
    const discount = Math.max(0, basePrice - guestPrice);
    const kindParts = kind.parts;
    return {
      ...form.draft,
      servicePrice: "0",
      discount: String(discount),
      cost: String(Math.max(0, costPerUse)),
      expectedUses: String(
        Math.max(1, Math.round(parseNumber(form.maxUses)) || 50),
      ),
      validityDays: form.validityOn ? form.draft.validityDays || "7" : "0",
      minSpend: form.minSpendOn ? form.draft.minSpend : "0",
      tariffGroupId: form.tariffOn ? form.draft.tariffGroupId : "",
      tariffPeriodId: form.tariffOn ? form.draft.tariffPeriodId : "",
      tariffTypeId: form.tariffOn ? form.draft.tariffTypeId : "",
      firstAccountingKind: accountingKindForPart(kindParts[0]),
      secondAccountingKind: accountingKindForPart(kindParts[1]),
      firstAccountingReference:
        kindParts[0] === "product" ? "" : form.draft.gameItem.trim(),
      secondAccountingReference:
        kindParts[1] === "product" ? "" : form.draft.barItems.trim(),
      firstAccountingProductId:
        kindParts[0] === "product" ? form.draft.firstAccountingProductId : "",
      secondAccountingProductId:
        kindParts[1] === "product" ? form.draft.secondAccountingProductId : "",
      writeOffRule: "ON_REDEEM",
    };
  }

  async function saveBundle(): Promise<MarketingPromoBundle | null> {
    const draft = buildDraftForSave();
    const economics = buildPromoBundleEconomics(draft);
    const verdict = buildPromoBundleVerdict(draft, economics);
    const response = await fetch(
      bundle
        ? `/api/marketing/promo-bundles/${encodeURIComponent(bundle.id)}`
        : "/api/marketing/promo-bundles",
      {
        method: bundle ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: suggestedName,
          bundleType: draft.bundleType,
          mechanicConfig: buildPromoBundleConfig(
            draft,
            economics,
            verdict,
            products,
            tariffConditions,
          ),
          note: buildPromoBundleNote(
            draft,
            economics,
            products,
            tariffConditions,
          ),
        }),
      },
    );

    if (!response.ok) {
      setError(await readError(response));
      return null;
    }

    return (await response.json()) as MarketingPromoBundle;
  }

  function firstBlockingStep() {
    return promoBundleWizardSteps.find(
      (item) => item.id !== "who" && stepIssue[item.id],
    );
  }

  async function finish(mode: "draft" | "launch") {
    if (saving) return;
    const blocking = firstBlockingStep();
    if (blocking) {
      setStep(blocking.id);
      setError(stepIssue[blocking.id]);
      return;
    }
    const launchNeeded =
      mode === "launch" &&
      form.audienceMode !== "GAME" &&
      currentLaunches.length === 0;
    if (mode === "launch" && stepIssue.who) {
      setError(stepIssue.who);
      return;
    }

    setSaving(mode);
    setError(null);
    const saved = await saveBundle();
    if (!saved) {
      setSaving(null);
      return;
    }

    if (launchNeeded) {
      const response = await fetch("/api/marketing/promo-bundle-launches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promoBundleId: saved.id,
          audienceId:
            form.audienceMode === "GROUP" ? form.audienceId || null : null,
          storeIds: form.storeScope === "NETWORK" ? [] : form.storeIds,
          periodFrom: form.periodFrom || null,
          periodTo: form.periodTo || null,
          maxUses: Math.round(parseNumber(form.maxUses)) || null,
          note: null,
        }),
      });

      if (!response.ok) {
        setError(
          `Набор сохранён, но запустить не удалось: ${await readError(response)}`,
        );
        setSaving(null);
        router.replace(
          `${basePath}?edit=${encodeURIComponent(saved.id)}&step=who`,
        );
        return;
      }
    }

    if (mode === "launch" && form.audienceMode === "GAME") {
      router.push(
        `/gamification/missions/wizard?promoCodeId=${encodeURIComponent(saved.id)}`,
      );
      return;
    }

    router.push(basePath);
    router.refresh();
  }

  async function stopLaunch(launch: MarketingPromoBundleLaunch) {
    setStoppingLaunchId(launch.id);
    setError(null);
    const response = await fetch(
      `/api/marketing/promo-bundle-launches/${encodeURIComponent(launch.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FINISHED" }),
      },
    );
    if (!response.ok) {
      setError(await readError(response));
      setStoppingLaunchId(null);
      return;
    }
    const updated = (await response.json()) as MarketingPromoBundleLaunch;
    setLaunchRows((rows) =>
      rows.map((row) => (row.id === updated.id ? updated : row)),
    );
    setStoppingLaunchId(null);
  }

  const isLast = step === "who";
  const finalLabel =
    form.audienceMode === "GAME"
      ? "Сохранить и выбрать задание"
      : currentLaunches.length > 0
        ? "Сохранить изменения"
        : "Запустить набор";

  return (
    <section className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-950 sm:text-3xl dark:text-white">
          {bundle ? bundle.name : "Новый промо-набор"}
        </h1>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Четыре коротких шага. Справа видно, как набор увидит администратор на
          кассе.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        <nav
          aria-label="Шаги"
          className="grid h-fit grid-cols-2 gap-1 rounded-xl border border-zinc-200 bg-white p-2 sm:grid-cols-4 lg:grid-cols-1 dark:border-zinc-800 dark:bg-zinc-900"
        >
          {promoBundleWizardSteps.map((item, index) => {
            const isActive = item.id === step;
            const isDone = stepDone(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(item.id)}
                aria-current={isActive ? "step" : undefined}
                className={[
                  "flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                  isActive
                    ? "bg-emerald-50 ring-1 ring-emerald-300 dark:bg-emerald-500/10 dark:ring-emerald-500/40"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold",
                    isActive
                      ? "bg-emerald-500 text-zinc-950"
                      : isDone
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                  ].join(" ")}
                >
                  {isDone ? (
                    <Check size={14} weight="bold" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm text-zinc-950 dark:text-white">
                    {item.label}
                  </strong>
                  <small
                    className={
                      isDone
                        ? "text-xs text-emerald-700 dark:text-emerald-300"
                        : "text-xs text-zinc-500 dark:text-zinc-400"
                    }
                  >
                    {isDone ? "Готово" : isActive ? "Сейчас" : "Заполнить"}
                  </small>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="grid h-fit min-w-0 gap-5 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
          {step === "what" ? (
            <div className="grid gap-5">
              <StepTitle
                title="Что получает гость"
                text="Начните с готового шаблона или выберите вид набора. Товар берём из ассортимента, поэтому его цена подставится сама."
              />
              <div>
                <p className="mb-2 text-sm font-semibold text-zinc-950 dark:text-white">
                  Шаблоны
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {promoBundleTemplates.map((item) => (
                    <OptionButton
                      key={item.id}
                      active={form.templateId === item.id}
                      title={item.title}
                      text={item.description}
                      onClick={() => applyTemplate(item.id)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-zinc-950 dark:text-white">
                  Вид набора
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {promoBundleKinds.map((item) => (
                    <OptionButton
                      key={item.id}
                      active={form.draft.bundleType === item.id}
                      title={item.title}
                      text={item.example}
                      onClick={() => chooseKind(item.id)}
                    />
                  ))}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {([0, 1] as const).map((index) => (
                  <PartField
                    key={`${form.draft.bundleType}-${index}`}
                    part={kind.parts[index]}
                    label={kind.labels[index]}
                    text={
                      index === 0 ? form.draft.gameItem : form.draft.barItems
                    }
                    price={
                      index === 0 ? form.draft.gamePrice : form.draft.barPrice
                    }
                    productId={
                      index === 0
                        ? form.draft.firstAccountingProductId
                        : form.draft.secondAccountingProductId
                    }
                    products={activeProducts}
                    productById={productById}
                    onText={(value) =>
                      updateDraft(
                        index === 0 ? { gameItem: value } : { barItems: value },
                      )
                    }
                    onPrice={(value) =>
                      updateDraft(
                        index === 0
                          ? { gamePrice: value }
                          : { barPrice: value },
                      )
                    }
                    onProduct={(product) => choosePartProduct(index, product)}
                  />
                ))}
              </div>
              <Field
                id="promo-name"
                label="Название для администратора"
                hint="Так набор будет называться в списке и в журнале использований."
              >
                <input
                  id="promo-name"
                  value={form.name}
                  placeholder={
                    template?.name ??
                    (hasComposition
                      ? offerLine
                      : "Например: Комбо «Вечер в клубе»")
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </Field>
            </div>
          ) : null}

          {step === "price" ? (
            <div className="grid gap-5">
              <StepTitle
                title="Сколько платит гость"
                text="Обычную цену мы сложили из частей набора. Введите цену для гостя, выгода и остаток клубу посчитаются сами."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Обычная цена
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">
                    {rub(basePrice)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {kind.labels[0].toLowerCase()} {rub(firstPrice)} +{" "}
                    {kind.labels[1].toLowerCase()} {rub(secondPrice)}
                  </p>
                </div>
                <Field
                  id="promo-guest-price"
                  label="Гость платит, ₽"
                  hint={
                    priceCheck.discount > 0
                      ? `Выгода гостя ${rub(priceCheck.discount)}${
                          priceCheck.discountPercent === null
                            ? ""
                            : ` (−${Math.round(priceCheck.discountPercent)}%)`
                        }`
                      : "Без выгоды для гостя набор вряд ли возьмут."
                  }
                >
                  <input
                    id="promo-guest-price"
                    inputMode="numeric"
                    value={form.guestPrice}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        guestPrice: event.target.value,
                      }))
                    }
                    className={`${inputClass} h-12 text-xl font-bold tabular-nums`}
                  />
                </Field>
              </div>
              {kind.parts[1] !== "bonus" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Быстро:
                  </span>
                  {[10, 20, 30].map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          guestPrice: String(
                            suggestedGuestPrice(
                              current.draft.bundleType,
                              firstPrice,
                              secondPrice,
                              percent,
                            ),
                          ),
                        }))
                      }
                      className="min-h-9 cursor-pointer rounded-lg border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 transition hover:border-emerald-400 dark:border-zinc-700 dark:text-zinc-100"
                    >
                      скидка {percent}%
                    </button>
                  ))}
                </div>
              ) : null}
              <Verdict check={priceCheck} />
              <MoreFields label="Дополнительно: своя себестоимость">
                <Field
                  id="promo-cost"
                  label="Себестоимость одного набора, ₽"
                  hint={`Сейчас считаем сами: ${rub(autoCost)} (закупочная цена товаров${
                    kind.parts.includes("bonus") ? " и стоимость бонуса" : ""
                  }). Оставьте пустым, чтобы считать так же.`}
                >
                  <input
                    id="promo-cost"
                    inputMode="numeric"
                    value={form.costOverride}
                    placeholder={String(Math.round(autoCost))}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        costOverride: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
              </MoreFields>
            </div>
          ) : null}

          {step === "rules" ? (
            <div className="grid gap-1">
              <StepTitle
                title="Условия"
                text="Обычные правила уже включены. Меняйте, только если нужно."
              />
              <div className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
                <ToggleRow
                  id="rule-one"
                  label="Один раз на гостя"
                  text="Второй раз администратор увидит предупреждение."
                  checked={form.draft.onePerGuest}
                  onChange={(checked) => updateDraft({ onePerGuest: checked })}
                />
                <ToggleRow
                  id="rule-stack"
                  label="Не суммируется с другими скидками"
                  text="Нельзя совместить с другой акцией в одном чеке."
                  checked={form.draft.noStacking}
                  onChange={(checked) => updateDraft({ noStacking: checked })}
                />
                <ToggleRow
                  id="rule-validity"
                  label={
                    form.validityOn
                      ? `Действует ${form.draft.validityDays || 7} ${pluralRu(
                          Math.round(
                            parseNumber(form.draft.validityDays || "7"),
                          ),
                          "день",
                          "дня",
                          "дней",
                        )} после выдачи`
                      : "Срок после выдачи"
                  }
                  text="Сколько дней у гостя, чтобы прийти за набором."
                  checked={form.validityOn}
                  onChange={(checked) =>
                    setForm((current) => ({ ...current, validityOn: checked }))
                  }
                >
                  <input
                    aria-label="Дней после выдачи"
                    inputMode="numeric"
                    value={form.draft.validityDays}
                    onChange={(event) =>
                      updateDraft({ validityDays: event.target.value })
                    }
                    className={`${smallInputClass} w-24`}
                  />
                </ToggleRow>
                <ToggleRow
                  id="rule-min"
                  label="Минимальный чек"
                  text="Набор только при покупке от заданной суммы."
                  checked={form.minSpendOn}
                  onChange={(checked) =>
                    setForm((current) => ({ ...current, minSpendOn: checked }))
                  }
                >
                  <input
                    aria-label="Минимальный чек, ₽"
                    inputMode="numeric"
                    value={
                      form.draft.minSpend === "0" ? "" : form.draft.minSpend
                    }
                    placeholder="500"
                    onChange={(event) =>
                      updateDraft({ minSpend: event.target.value })
                    }
                    className={`${smallInputClass} w-28`}
                  />
                </ToggleRow>
                <ToggleRow
                  id="rule-tariff"
                  label="Только на определённых тарифах"
                  text="Например, дневной тариф в будни, чтобы загрузить тихие часы. Тарифы берём из Langame."
                  checked={form.tariffOn}
                  onChange={(checked) =>
                    setForm((current) => ({ ...current, tariffOn: checked }))
                  }
                />
                {form.tariffOn ? (
                  <TariffPicker
                    draft={form.draft}
                    tariffConditions={tariffConditions}
                    onChange={updateDraft}
                  />
                ) : null}
                <ToggleRow
                  id="rule-approval"
                  label="Подтверждает старший администратор"
                  text="Для дорогих наборов: администратор не выдаст набор сам."
                  checked={form.draft.requiresApproval}
                  onChange={(checked) =>
                    updateDraft({ requiresApproval: checked })
                  }
                />
              </div>
              <div className="mt-3">
                <MoreFields label="Дополнительно: своё условие">
                  <Field
                    id="promo-extra"
                    label="Своё условие"
                    hint="Покажем администратору рядом с набором."
                  >
                    <input
                      id="promo-extra"
                      value={form.draft.serviceItems}
                      placeholder="Например: только при брони через администратора"
                      onChange={(event) =>
                        updateDraft({ serviceItems: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                </MoreFields>
              </div>
            </div>
          ) : null}

          {step === "who" ? (
            <div className="grid gap-5">
              <StepTitle
                title="Кому и где"
                text="Без этого шага набор лежит в списке, но гости его не получают."
              />
              {currentLaunches.length > 0 ? (
                <div className="grid gap-2">
                  {currentLaunches.map((launch) => (
                    <div
                      key={launch.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                    >
                      <p className="text-sm text-emerald-900 dark:text-emerald-100">
                        <strong>Уже идёт:</strong>{" "}
                        {promoBundleLaunchSummary(launch, stores.length).join(
                          " · ",
                        )}
                        {launch.maxUses
                          ? ` · до ${launch.maxUses} наборов`
                          : ""}
                      </p>
                      <button
                        type="button"
                        disabled={stoppingLaunchId === launch.id}
                        onClick={() => stopLaunch(launch)}
                        className="min-h-9 cursor-pointer rounded-lg border border-red-300 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-500/50 dark:text-red-300 dark:hover:bg-red-500/10"
                      >
                        {stoppingLaunchId === launch.id
                          ? "Останавливаем…"
                          : "Остановить"}
                      </button>
                    </div>
                  ))}
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Изменения состава и цены сразу видны в этом запуске. Чтобы
                    поменять группу, клубы или даты, остановите его и запустите
                    заново.
                  </p>
                </div>
              ) : (
                <>
                  {template ? (
                    <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                      Шаблон «{template.title}» рассчитан на:{" "}
                      {template.audienceHint}.
                    </p>
                  ) : null}
                  <div
                    className="grid gap-2"
                    role="radiogroup"
                    aria-label="Кому"
                  >
                    {(
                      [
                        [
                          "ALL",
                          "Всем гостям",
                          "Любой гость может попросить набор на кассе.",
                        ],
                        [
                          "GROUP",
                          "Группе гостей",
                          "Только гости из выбранной группы.",
                        ],
                        [
                          "GAME",
                          "Как награда в игровом задании",
                          "Гость получит набор, выполнив задание. После сохранения откроется мастер заданий.",
                        ],
                      ] as const
                    ).map(([value, title, text]) => (
                      <OptionButton
                        key={value}
                        role="radio"
                        active={form.audienceMode === value}
                        title={title}
                        text={text}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            audienceMode: value,
                          }))
                        }
                      />
                    ))}
                  </div>
                  {form.audienceMode === "GROUP" ? (
                    <Field
                      id="promo-audience"
                      label="Группа гостей"
                      hint={
                        audienceRows.length === 0
                          ? "Групп пока нет. Соберите первую, это 4 коротких шага."
                          : undefined
                      }
                    >
                      <div className="flex flex-wrap gap-2">
                        <select
                          id="promo-audience"
                          value={form.audienceId}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              audienceId: event.target.value,
                            }))
                          }
                          className={`${inputClass} min-w-0 flex-1 sm:min-w-64`}
                        >
                          <option value="">Выберите группу</option>
                          {audienceRows.map((audience) => (
                            <option key={audience.id} value={audience.id}>
                              {audience.name} · {audience.guestsCount}{" "}
                              {pluralRu(
                                audience.guestsCount,
                                "гость",
                                "гостя",
                                "гостей",
                              )}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setGroupBuilderOpen(true)}
                          className="min-h-10 cursor-pointer rounded-xl border border-emerald-400 px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                        >
                          Собрать новую группу
                        </button>
                      </div>
                    </Field>
                  ) : null}
                  {form.audienceMode === "GAME" ? (
                    <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                      Набор сохранится, и откроется мастер игровых заданий с уже
                      выбранной наградой «{suggestedName}». Клубы и сроки
                      задаются там же.
                    </p>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <fieldset className="sm:col-span-2">
                        <legend className="mb-1.5 text-sm font-semibold text-zinc-950 dark:text-white">
                          Клубы
                        </legend>
                        <div className="flex flex-wrap gap-2">
                          <ChipToggle
                            active={form.storeScope === "NETWORK"}
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                storeScope: "NETWORK",
                                storeIds: [],
                              }))
                            }
                          >
                            Все клубы
                          </ChipToggle>
                          {stores.map((store) => {
                            const active =
                              form.storeScope === "STORES" &&
                              form.storeIds.includes(store.id);
                            return (
                              <ChipToggle
                                key={store.id}
                                active={active}
                                onClick={() =>
                                  setForm((current) => {
                                    const ids =
                                      current.storeScope === "STORES"
                                        ? current.storeIds
                                        : [];
                                    const next = ids.includes(store.id)
                                      ? ids.filter((id) => id !== store.id)
                                      : [...ids, store.id];
                                    return {
                                      ...current,
                                      storeScope:
                                        next.length > 0 ? "STORES" : "NETWORK",
                                      storeIds: next,
                                    };
                                  })
                                }
                              >
                                {store.name}
                              </ChipToggle>
                            );
                          })}
                        </div>
                      </fieldset>
                      <Field id="promo-from" label="С">
                        <input
                          id="promo-from"
                          type="date"
                          value={form.periodFrom}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              periodFrom: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field id="promo-to" label="По">
                        <input
                          id="promo-to"
                          type="date"
                          value={form.periodTo}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              periodTo: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field
                        id="promo-max"
                        label="Сколько наборов максимум"
                        hint={`Скидки на все наборы: до ${rub(
                          priceCheck.discount *
                            Math.max(0, parseNumber(form.maxUses)),
                        )}`}
                      >
                        <input
                          id="promo-max"
                          inputMode="numeric"
                          value={form.maxUses}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              maxUses: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </Field>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}

          {error ||
          (stepIssue[step] && step !== "rules" && step !== "price") ? (
            <p
              role={error ? "alert" : undefined}
              className={
                error
                  ? "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
                  : "text-sm text-zinc-600 dark:text-zinc-400"
              }
            >
              {error ?? stepIssue[step]}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={() => goTo(promoBundleWizardSteps[stepIndex - 1].id)}
                className={secondaryButtonClass}
              >
                Назад
              </button>
            ) : (
              <Link href={basePath} className={secondaryButtonClass}>
                К списку
              </Link>
            )}
            <div className="flex flex-wrap gap-2">
              {(isLast || bundle) &&
              !(
                isLast &&
                currentLaunches.length > 0 &&
                form.audienceMode !== "GAME"
              ) ? (
                <button
                  type="button"
                  disabled={Boolean(saving)}
                  onClick={() => finish("draft")}
                  className={secondaryButtonClass}
                >
                  {saving === "draft"
                    ? "Сохраняем…"
                    : bundle
                      ? "Сохранить"
                      : "Сохранить без запуска"}
                </button>
              ) : null}
              {isLast ? (
                <button
                  type="button"
                  disabled={Boolean(saving)}
                  onClick={() => finish("launch")}
                  className={primaryButtonClass}
                >
                  {saving === "launch" ? "Сохраняем…" : finalLabel}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(stepIssue[step])}
                  onClick={() => goTo(promoBundleWizardSteps[stepIndex + 1].id)}
                  className={primaryButtonClass}
                >
                  Дальше
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="grid h-fit gap-3 lg:col-start-2 xl:col-start-auto">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Так увидит администратор
          </p>
          <div className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <strong className="text-base text-zinc-950 [overflow-wrap:anywhere] dark:text-white">
              {suggestedName || "Название набора"}
            </strong>
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              {hasComposition ? offerLine : "Выберите, что получает гость"}
            </p>
            <p className="tabular-nums">
              <strong className="text-2xl text-zinc-950 dark:text-white">
                {rub(guestPrice)}
              </strong>
              {basePrice > guestPrice && guestPrice > 0 ? (
                <span className="ml-2 text-sm text-zinc-500 line-through dark:text-zinc-400">
                  {rub(basePrice)}
                </span>
              ) : null}
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              {previewRules(form).map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Кому: {previewAudience(form, audienceRows, stores)}
            </p>
          </div>
          {guestPrice > 0 && basePrice > 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-3 text-sm tabular-nums text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <strong className="text-zinc-950 dark:text-white">
                {priceCheck.verdict}.
              </strong>{" "}
              {isTopUp
                ? priceCheck.detail
                : priceCheck.marginPercent !== null && costPerUse > 0
                  ? `Остаётся клубу ≈${rub(priceCheck.marginPerUse)} (${Math.round(
                      priceCheck.marginPercent,
                    )}%).`
                  : null}
            </p>
          ) : null}
        </aside>
      </div>

      {groupBuilderOpen ? (
        <GroupBuilderDialog
          stores={stores}
          onClose={() => setGroupBuilderOpen(false)}
          onCreated={(audience) => {
            setAudienceRows((rows) => [
              audience,
              ...rows.filter((row) => row.id !== audience.id),
            ]);
            setForm((current) => ({
              ...current,
              audienceMode: "GROUP",
              audienceId: audience.id,
            }));
            setGroupBuilderOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

function previewRules(form: WizardForm) {
  const rules: string[] = [];
  if (form.draft.onePerGuest) rules.push("один раз на гостя");
  if (form.draft.noStacking) rules.push("не суммируется со скидками");
  if (form.validityOn) {
    const days = Math.round(parseNumber(form.draft.validityDays || "7"));
    rules.push(`${days} ${pluralRu(days, "день", "дня", "дней")} после выдачи`);
  }
  if (form.minSpendOn && parseNumber(form.draft.minSpend) > 0) {
    rules.push(`чек от ${rub(parseNumber(form.draft.minSpend))}`);
  }
  if (form.tariffOn) rules.push("только на выбранных тарифах");
  if (form.draft.requiresApproval)
    rules.push("подтверждает старший администратор");
  if (form.draft.serviceItems.trim())
    rules.push(form.draft.serviceItems.trim());
  return rules.length > 0 ? rules : ["без ограничений"];
}

function previewAudience(
  form: WizardForm,
  audiences: GuestAudience[],
  stores: Store[],
) {
  if (form.audienceMode === "GAME") {
    return "награда в игровом задании";
  }
  const who =
    form.audienceMode === "GROUP"
      ? (audiences.find((item) => item.id === form.audienceId)?.name ??
        "группа не выбрана")
      : "все гости";
  const where =
    form.storeScope === "NETWORK" ||
    form.storeIds.length === 0 ||
    form.storeIds.length >= stores.length
      ? "все клубы"
      : form.storeIds.length === 1
        ? (stores.find((store) => store.id === form.storeIds[0])?.name ??
          "1 клуб")
        : `${form.storeIds.length} ${pluralRu(form.storeIds.length, "клуб", "клуба", "клубов")}`;
  return `${who} · ${where}`;
}

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 hover:border-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:hover:border-zinc-600";

const smallInputClass = inputClass.replace("w-full ", "");

const primaryButtonClass =
  "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800";

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-950 dark:text-white">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {text}
      </p>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-semibold text-zinc-950 dark:text-white"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1.5 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function OptionButton({
  active,
  title,
  text,
  onClick,
  role,
}: {
  active: boolean;
  title: string;
  text: string;
  onClick: () => void;
  role?: "radio";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? active : undefined}
      aria-pressed={role ? undefined : active}
      onClick={onClick}
      className={[
        "cursor-pointer rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
        active
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
          : "border-zinc-200 bg-white hover:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950",
      ].join(" ")}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
        {active ? (
          <Check
            size={14}
            weight="bold"
            aria-hidden
            className="text-emerald-600 dark:text-emerald-300"
          />
        ) : null}
        {title}
      </span>
      <span className="mt-1 block text-sm leading-5 text-zinc-600 dark:text-zinc-400">
        {text}
      </span>
    </button>
  );
}

function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
        active
          ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100"
          : "border-zinc-300 text-zinc-700 hover:border-emerald-400 dark:border-zinc-700 dark:text-zinc-300",
      ].join(" ")}
    >
      {active ? <Check size={12} weight="bold" aria-hidden /> : null}
      {children}
    </button>
  );
}

function ToggleRow({
  id,
  label,
  text,
  checked,
  onChange,
  children,
}: {
  id: string;
  label: string;
  text: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3 py-3">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-lg peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/40"
      >
        <span
          aria-hidden
          className={[
            "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition",
            checked ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none",
              checked ? "translate-x-[18px]" : "translate-x-0.5",
            ].join(" ")}
          />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-950 dark:text-white">
            {label}
          </span>
          <span className="mt-0.5 block text-sm leading-5 text-zinc-600 dark:text-zinc-400">
            {text}
          </span>
        </span>
      </label>
      {checked && children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

function Verdict({
  check,
}: {
  check: ReturnType<typeof checkPromoBundlePrice>;
}) {
  const tone =
    check.tone === "ready"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100"
      : check.tone === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
        : "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100";
  return (
    <div className={`rounded-xl border p-3 ${tone}`} aria-live="polite">
      <strong className="text-sm">{check.verdict}</strong>
      <p className="mt-0.5 text-sm leading-5">{check.detail}</p>
    </div>
  );
}

function PartField({
  part,
  label,
  text,
  price,
  productId,
  products,
  productById,
  onText,
  onPrice,
  onProduct,
}: {
  part: PromoBundlePartKind;
  label: string;
  text: string;
  price: string;
  productId: string;
  products: Product[];
  productById: Map<string, Product>;
  onText: (value: string) => void;
  onPrice: (value: string) => void;
  onProduct: (product: Product | null) => void;
}) {
  const fieldId = useMemo(
    () => `part-${label.replace(/\s+/g, "-").toLowerCase()}`,
    [label],
  );

  if (part === "product") {
    return (
      <ProductPicker
        id={fieldId}
        label={label}
        selected={productById.get(productId) ?? null}
        products={products}
        onSelect={onProduct}
      />
    );
  }

  const placeholders: Record<
    Exclude<PromoBundlePartKind, "product">,
    [string, string]
  > = {
    game: ["Например: 2 часа в общем зале", "Цена этого времени без скидки."],
    bonus: [
      "Например: +30 минут в следующий визит",
      "Во сколько вам обходится бонус.",
    ],
    topup: ["Например: пополнение от 1 000 ₽", "Сумма пополнения."],
  };
  const [placeholder, priceHint] = placeholders[part];

  return (
    <fieldset className="grid min-w-0 gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <legend className="px-1 text-sm font-semibold text-zinc-950 dark:text-white">
        {label}
      </legend>
      <label htmlFor={`${fieldId}-text`} className="sr-only">
        {label}: что получает гость
      </label>
      <input
        id={`${fieldId}-text`}
        value={text}
        placeholder={placeholder}
        onChange={(event) => onText(event.target.value)}
        className={inputClass}
      />
      <label
        htmlFor={`${fieldId}-price`}
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        {part === "topup" ? "Сумма, ₽" : "Обычная цена, ₽"}
      </label>
      <input
        id={`${fieldId}-price`}
        inputMode="numeric"
        value={price}
        placeholder="0"
        onChange={(event) => onPrice(event.target.value)}
        className={`${inputClass} tabular-nums`}
        aria-describedby={`${fieldId}-price-hint`}
      />
      <p
        id={`${fieldId}-price-hint`}
        className="text-xs text-zinc-500 dark:text-zinc-400"
      >
        {priceHint}
      </p>
    </fieldset>
  );
}

function ProductPicker({
  id,
  label,
  selected,
  products,
  onSelect,
}: {
  id: string;
  label: string;
  selected: Product | null;
  products: Product[];
  onSelect: (product: Product | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!selected);
  const normalized = query.trim().toLocaleLowerCase("ru-RU");
  const matches = useMemo(() => {
    const rows = normalized
      ? products.filter((product) =>
          [product.name, product.article, product.category?.name ?? ""]
            .join(" ")
            .toLocaleLowerCase("ru-RU")
            .includes(normalized),
        )
      : products;
    return rows.slice(0, 6);
  }, [normalized, products]);

  return (
    <fieldset className="grid min-w-0 gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <legend className="px-1 text-sm font-semibold text-zinc-950 dark:text-white">
        {label}
      </legend>
      {selected && !open ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-950 [overflow-wrap:anywhere] dark:text-white">
              {selected.name}
            </p>
            <p className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
              {rub(parseNumber(selected.salePrice))} · закупка{" "}
              {rub(productCost(selected))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-9 cursor-pointer rounded-lg border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Изменить
          </button>
        </div>
      ) : (
        <>
          <label htmlFor={`${id}-search`} className="sr-only">
            Найти товар: {label}
          </label>
          <input
            id={`${id}-search`}
            type="search"
            value={query}
            placeholder="Найти в ассортименте"
            onChange={(event) => setQuery(event.target.value)}
            className={inputClass}
          />
          {products.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              В ассортименте пока нет товаров.{" "}
              <Link
                href="/products"
                className="font-semibold text-emerald-700 underline dark:text-emerald-300"
              >
                Открыть товары
              </Link>
            </p>
          ) : matches.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Ничего не нашли. Попробуйте другое название или артикул.
            </p>
          ) : (
            <ul className="grid gap-1">
              {matches.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(product);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <span className="min-w-0 text-zinc-900 [overflow-wrap:anywhere] dark:text-zinc-100">
                      {product.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {rub(parseNumber(product.salePrice))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </fieldset>
  );
}

function TariffPicker({
  draft,
  tariffConditions,
  onChange,
}: {
  draft: PromoBundleDraft;
  tariffConditions: MarketingTariffConditions;
  onChange: (patch: Partial<PromoBundleDraft>) => void;
}) {
  const total =
    tariffConditions.groups.length +
    tariffConditions.periods.length +
    tariffConditions.types.length;

  if (total === 0) {
    return (
      <p className="py-3 text-sm leading-5 text-amber-800 dark:text-amber-200">
        Тарифы из Langame ещё не загружены. Проверьте подключение в разделе
        «Подключения» или опишите время в «Своё условие» ниже.
      </p>
    );
  }

  const selects: Array<
    [keyof PromoBundleDraft, string, MarketingTariffConditionItem[], string]
  > = [
    [
      "tariffGroupId",
      "Группа тарифов",
      tariffConditions.groups,
      "Любая группа",
    ],
    [
      "tariffPeriodId",
      "Время действия",
      tariffConditions.periods,
      "Любое время",
    ],
    ["tariffTypeId", "Тип тарифа", tariffConditions.types, "Любой тип"],
  ];

  return (
    <div className="grid gap-3 py-3 sm:grid-cols-3">
      {selects.map(([key, label, options, empty]) => (
        <Field key={key} id={`tariff-${key}`} label={label}>
          <select
            id={`tariff-${key}`}
            value={String(draft[key] ?? "")}
            onChange={(event) => onChange({ [key]: event.target.value })}
            className={inputClass}
            disabled={options.length === 0}
          >
            <option value="">{empty}</option>
            {options.map((option) => (
              <option key={option.id} value={option.value}>
                {option.displayName}
              </option>
            ))}
          </select>
        </Field>
      ))}
    </div>
  );
}

function GroupBuilderDialog({
  stores,
  onClose,
  onCreated,
}: {
  stores: Store[];
  onClose: () => void;
  onCreated: (audience: GuestAudience) => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Новая группа гостей"
      className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/60 px-3 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto max-w-4xl rounded-2xl bg-zinc-50 p-4 shadow-xl sm:p-5 dark:bg-zinc-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Новая группа гостей
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              После сохранения группа сразу выберется для промо-набора.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClass}
          >
            Закрыть
          </button>
        </div>
        <GuestGroupBuilder
          stores={stores.map((store) => ({ id: store.id, name: store.name }))}
          onCancel={onClose}
          onCreated={onCreated}
        />
      </div>
    </div>,
    document.body,
  );
}

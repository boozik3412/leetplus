import type {
  MarketingPromoBundleLaunch,
  MarketingPromoBundleStatus,
  MarketingPromoBundleUsage,
} from "./marketing";

// Pure logic of the promo bundle wizard (/marketing/promo-bundles):
// four steps «Что получает гость» → «Сколько платит» → «Условия» →
// «Кому и где». The saved bundle keeps the existing mechanicConfig shape;
// this module only decides what the wizard shows and suggests.

export type PromoBundleKind =
  | "game_product"
  | "game_bonus"
  | "product_product"
  | "balance_bonus";

/** What one of the two parts of a bundle is, so the wizard shows the right field. */
export type PromoBundlePartKind = "game" | "product" | "bonus" | "topup";

export type PromoBundleWizardStep = "what" | "price" | "rules" | "who";

export const promoBundleWizardSteps: ReadonlyArray<{
  id: PromoBundleWizardStep;
  label: string;
}> = [
  { id: "what", label: "Что получает гость" },
  { id: "price", label: "Сколько платит" },
  { id: "rules", label: "Условия" },
  { id: "who", label: "Кому и где" },
];

export const promoBundleKinds: ReadonlyArray<{
  id: PromoBundleKind;
  title: string;
  example: string;
  parts: readonly [PromoBundlePartKind, PromoBundlePartKind];
  labels: readonly [string, string];
}> = [
  {
    id: "game_product",
    title: "Игра + товар",
    example: "2 часа + энергетик",
    parts: ["game", "product"],
    labels: ["Игровое время", "Товар"],
  },
  {
    id: "game_bonus",
    title: "Игра + бонус на следующий визит",
    example: "3 часа сейчас, +30 минут потом",
    parts: ["game", "bonus"],
    labels: ["Игровое время", "Бонус"],
  },
  {
    id: "product_product",
    title: "Товар + товар",
    example: "бургер + напиток",
    parts: ["product", "product"],
    labels: ["Первый товар", "Второй товар"],
  },
  {
    id: "balance_bonus",
    title: "Бонус за пополнение",
    example: "пополни на 1 000 ₽, получи 100 бонусов",
    parts: ["topup", "bonus"],
    labels: ["Пополнение баланса", "Бонус"],
  },
];

export function promoBundleKind(id: string) {
  return promoBundleKinds.find((kind) => kind.id === id) ?? promoBundleKinds[0];
}

export type PromoBundleAudienceMode = "ALL" | "GROUP" | "GAME";

export type PromoBundleTemplate = {
  id: string;
  title: string;
  description: string;
  kind: PromoBundleKind;
  name: string;
  first: string;
  firstPrice: number;
  second: string;
  secondPrice: number;
  /** Suggested guest discount, percent of the usual price. */
  discountPercent: number;
  onePerGuest: boolean;
  noStacking: boolean;
  validityDays: number;
  extraCondition: string;
  audienceMode: PromoBundleAudienceMode;
  /** Which guests the template is meant for, shown on step «Кому и где». */
  audienceHint: string;
};

export const promoBundleTemplates: ReadonlyArray<PromoBundleTemplate> = [
  {
    id: "return",
    title: "Вернуть ушедших",
    description: "Игра и товар со скидкой тем, кто давно не был.",
    kind: "game_product",
    name: "Возвращайся: игра + напиток",
    first: "2 часа игры",
    firstPrice: 0,
    second: "",
    secondPrice: 0,
    discountPercent: 20,
    onePerGuest: true,
    noStacking: true,
    validityDays: 14,
    extraCondition: "",
    audienceMode: "GROUP",
    audienceHint:
      "гости, которые давно не приходили (группа «в риске» или «потерянные»)",
  },
  {
    id: "quiet-hours",
    title: "Загрузить тихие часы",
    description: "Игра дешевле в будни днём и бонус на следующий визит.",
    kind: "game_bonus",
    name: "Дневной пакет в будни",
    first: "3 часа в будни с 10:00 до 16:00",
    firstPrice: 0,
    second: "+30 минут в следующий визит",
    secondPrice: 0,
    discountPercent: 25,
    onePerGuest: false,
    noStacking: true,
    validityDays: 30,
    extraCondition: "Только будни с 10:00 до 16:00",
    audienceMode: "ALL",
    audienceHint: "все гости",
  },
  {
    id: "bar",
    title: "Поднять бар",
    description: "Второй товар дешевле, чтобы вырос средний чек.",
    kind: "product_product",
    name: "Второй товар со скидкой",
    first: "",
    firstPrice: 0,
    second: "",
    secondPrice: 0,
    discountPercent: 15,
    onePerGuest: false,
    noStacking: true,
    validityDays: 14,
    extraCondition: "",
    audienceMode: "ALL",
    audienceHint: "все гости",
  },
  {
    id: "second-visit",
    title: "Второй визит новичка",
    description: "Бонус, чтобы новый гость пришёл ещё раз.",
    kind: "game_bonus",
    name: "Приходи ещё: бонусный час",
    first: "1 час игры",
    firstPrice: 0,
    second: "+1 час во второй визит",
    secondPrice: 0,
    discountPercent: 30,
    onePerGuest: true,
    noStacking: true,
    validityDays: 10,
    extraCondition: "",
    audienceMode: "GROUP",
    audienceHint: "новые гости, которые были один раз",
  },
  {
    id: "topup",
    title: "Бонус к пополнению",
    description: "Гость пополняет баланс и получает бонусы.",
    kind: "balance_bonus",
    name: "Бонус к пополнению",
    first: "Пополнение от 1 000 ₽",
    firstPrice: 1000,
    second: "100 бонусов на баланс",
    secondPrice: 100,
    discountPercent: 0,
    onePerGuest: true,
    noStacking: true,
    validityDays: 30,
    extraCondition: "",
    audienceMode: "ALL",
    audienceHint: "постоянные гости",
  },
];

export function promoBundleTemplate(id: string | null | undefined) {
  return promoBundleTemplates.find((template) => template.id === id) ?? null;
}

/** Rounds a price down to whole tens of rubles, the way clubs price offers. */
export function roundOfferPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(10, Math.floor(value / 10) * 10);
}

/**
 * Guest price for a suggested discount. When the second part is a bonus
 * (game + bonus, top-up + bonus) the bonus itself is the gift: the guest
 * pays for the first part only.
 */
export function suggestedGuestPrice(
  kind: PromoBundleKind,
  firstPrice: number,
  secondPrice: number,
  discountPercent: number,
) {
  if (promoBundleKind(kind).parts[1] === "bonus") {
    return Math.max(0, firstPrice);
  }

  const base = Math.max(0, firstPrice) + Math.max(0, secondPrice);
  const percent = Math.min(90, Math.max(0, discountPercent));

  return roundOfferPrice(base * (1 - percent / 100));
}

export type PromoBundlePriceCheck = {
  basePrice: number;
  guestPrice: number;
  discount: number;
  discountPercent: number | null;
  costPerUse: number;
  marginPerUse: number;
  marginPercent: number | null;
  tone: "ready" | "warning" | "blocked";
  verdict: string;
  detail: string;
};

/** The single verdict line the wizard shows next to the guest price. */
export function checkPromoBundlePrice({
  basePrice,
  guestPrice,
  costPerUse,
  kind = "game_product",
}: {
  basePrice: number;
  guestPrice: number;
  costPerUse: number;
  kind?: PromoBundleKind;
}): PromoBundlePriceCheck {
  const base = Math.max(0, basePrice);
  const price = Math.max(0, guestPrice);
  const cost = Math.max(0, costPerUse);
  const discount = Math.max(0, base - price);
  const discountPercent = base > 0 ? (discount / base) * 100 : null;
  const marginPerUse = price - cost;
  const marginPercent = price > 0 ? (marginPerUse / price) * 100 : null;
  const result = {
    basePrice: base,
    guestPrice: price,
    discount,
    discountPercent,
    costPerUse: cost,
    marginPerUse,
    marginPercent,
  };

  if (base <= 0) {
    return {
      ...result,
      tone: "blocked",
      verdict: "Укажите цены частей набора",
      detail:
        "Обычная цена набора пока 0 ₽. Вернитесь на шаг «Что получает гость» и укажите цену каждой части.",
    };
  }

  if (price <= 0) {
    return {
      ...result,
      tone: "blocked",
      verdict: "Введите, сколько платит гость",
      detail: "Цена для гостя должна быть больше 0 ₽.",
    };
  }

  if (price > base) {
    return {
      ...result,
      tone: "blocked",
      verdict: "Цена выше обычной",
      detail: `Гость заплатит больше, чем без набора (${formatRub(base)}). Снизьте цену.`,
    };
  }

  if (marginPerUse < 0) {
    return {
      ...result,
      tone: "blocked",
      verdict: "Набор продаётся в убыток",
      detail: `Себестоимость ${formatRub(cost)} больше цены для гостя. Поднимите цену или уменьшите скидку.`,
    };
  }

  // A top-up is the guest's own money on balance, not revenue: judge the
  // bonus by its share of the top-up instead of a margin.
  if (promoBundleKind(kind).parts[0] === "topup") {
    const share = price > 0 ? (discount / price) * 100 : 0;
    return {
      ...result,
      tone: share > 20 ? "warning" : "ready",
      verdict: share > 20 ? "Щедрый бонус" : "Бонус в разумных пределах",
      detail: `Бонус ${formatRub(discount)}, это ${Math.round(share)}% от пополнения.`,
    };
  }

  if (cost <= 0) {
    return {
      ...result,
      tone: "warning",
      verdict: "Не знаем себестоимость",
      detail:
        "Выберите товары из ассортимента или укажите себестоимость в «Дополнительно», чтобы проверить, сколько остаётся клубу.",
    };
  }

  if (discountPercent !== null && discountPercent > 40) {
    return {
      ...result,
      tone: "warning",
      verdict: "Очень большая скидка",
      detail: `Скидка ${Math.round(discountPercent)}%. Проверьте, что набор не заменит обычные покупки.`,
    };
  }

  return {
    ...result,
    tone: "ready",
    verdict: "Набор выгоден клубу",
    detail: `С каждого набора остаётся около ${formatRub(marginPerUse)}${
      marginPercent === null ? "" : ` (${Math.round(marginPercent)}%)`
    }.`,
  };
}

/** «2 часа игры + энергетик» — what the guest gets, in one line. */
export function promoBundleOfferLine(first: string, second: string) {
  return (
    [first.trim(), second.trim()].filter(Boolean).join(" + ") ||
    "состав не задан"
  );
}

export type PromoBundleCardStatus =
  | "running"
  | "scheduled"
  | "not_launched"
  | "finished"
  | "archived";

export type PromoBundleCardState = {
  status: PromoBundleCardStatus;
  label: string;
  launch: MarketingPromoBundleLaunch | null;
  used: number;
  revenue: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function launchIsCurrent(launch: MarketingPromoBundleLaunch, now: Date) {
  if (launch.status !== "ACTIVE") {
    return false;
  }

  // periodTo is a calendar day (midnight UTC): the launch runs through it.
  return (
    !launch.periodTo ||
    new Date(launch.periodTo).getTime() + DAY_MS > now.getTime()
  );
}

/**
 * What the catalog card says about a bundle: is it given to guests now,
 * which launch to show, and how many times it was used.
 */
export function promoBundleCardState({
  bundleId,
  bundleStatus,
  launches,
  usages,
  now = new Date(),
}: {
  bundleId: string;
  bundleStatus: MarketingPromoBundleStatus;
  launches: ReadonlyArray<MarketingPromoBundleLaunch>;
  usages: ReadonlyArray<MarketingPromoBundleUsage>;
  now?: Date;
}): PromoBundleCardState {
  const own = launches.filter((launch) => launch.promoBundle.id === bundleId);
  const confirmed = usages.filter(
    (usage) =>
      usage.promoBundle.id === bundleId && usage.status === "CONFIRMED",
  );
  const used = confirmed.reduce(
    (sum, usage) => sum + Math.max(0, usage.quantity || 0),
    0,
  );
  const revenue = confirmed.reduce(
    (sum, usage) => sum + Math.max(0, usage.amount || 0),
    0,
  );
  const current = own
    .filter((launch) => launchIsCurrent(launch, now))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const running = current.find(
    (launch) => !launch.periodFrom || new Date(launch.periodFrom) <= now,
  );
  const scheduled = current.find(
    (launch) => launch.periodFrom && new Date(launch.periodFrom) > now,
  );
  const latest =
    [...own].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null;

  if (bundleStatus === "ARCHIVED") {
    return {
      status: "archived",
      label: "В архиве",
      launch: latest,
      used,
      revenue,
    };
  }

  if (running) {
    return { status: "running", label: "Идёт", launch: running, used, revenue };
  }

  if (scheduled) {
    return {
      status: "scheduled",
      label: "Запланирован",
      launch: scheduled,
      used,
      revenue,
    };
  }

  if (latest) {
    return {
      status: "finished",
      label: "Закончился",
      launch: latest,
      used,
      revenue,
    };
  }

  return {
    status: "not_launched",
    label: "Не запущен",
    launch: null,
    used,
    revenue,
  };
}

/** «Гости в риске · 2 клуба · до 30 нояб.» for a launch. */
export function promoBundleLaunchSummary(
  launch: Pick<
    MarketingPromoBundleLaunch,
    "audience" | "storeIds" | "periodTo"
  >,
  storeCount: number,
) {
  const who = launch.audience ? launch.audience.name : "Все гости";
  const where =
    launch.storeIds.length === 0 || launch.storeIds.length >= storeCount
      ? "все клубы"
      : launch.storeIds.length === 1
        ? "1 клуб"
        : `${launch.storeIds.length} ${pluralRu(launch.storeIds.length, "клуб", "клуба", "клубов")}`;
  const until = launch.periodTo
    ? `до ${new Date(launch.periodTo).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      })}`
    : "без даты окончания";

  return [who, where, until];
}

export function pluralRu(
  count: number,
  one: string,
  few: string,
  many: string,
) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}

function formatRub(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

/**
 * A same-site path to come back to after the wizard (e.g. the campaign
 * wizard). Anything that is not a plain "/path" is ignored.
 */
export function safeReturnPath(value: string | null | undefined) {
  const path = value?.trim() ?? "";
  return path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !/[\u0000-\u001f]/.test(path)
    ? path
    : null;
}

/** returnTo with ?promoBundle=<id> added (keeps other params and #hash). */
export function returnWithPromoBundle(returnTo: string, promoBundleId: string) {
  const [path, hash = ""] = returnTo.split("#");
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}promoBundle=${encodeURIComponent(promoBundleId)}${
    hash ? `#${hash}` : ""
  }`;
}

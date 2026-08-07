export type LootBoxPrizeVisualMode = "AUTO" | "ICON" | "IMAGE";

export type LootBoxPrizeIconKey =
  | "coins"
  | "discount"
  | "ticket"
  | "clock"
  | "gift"
  | "merch";

export const lootBoxPrizeVisualModeOptions = [
  { value: "AUTO", label: "Автоматически" },
  { value: "ICON", label: "Стандартная иконка" },
  { value: "IMAGE", label: "Собственное изображение" },
];

export const lootBoxPrizeIconOptions = [
  { value: "coins", label: "Монеты / бонусы" },
  { value: "discount", label: "Скидка" },
  { value: "ticket", label: "Билет / промокод" },
  { value: "clock", label: "Игровое время" },
  { value: "gift", label: "Подарок" },
  { value: "merch", label: "Товар / мерч" },
];

export function defaultLootBoxPrizeIconKey(
  rewardType: string | null | undefined,
): LootBoxPrizeIconKey {
  switch ((rewardType ?? "").trim().toUpperCase()) {
    case "BONUS":
    case "BONUS_POINTS":
    case "BONUS_BALANCE":
    case "LOYALTY_BONUS":
    case "CASHBACK":
    case "XP":
      return "coins";
    case "DISCOUNT":
    case "DISCOUNT_PERCENT":
      return "discount";
    case "PROMOCODE":
    case "CASHIER_CODE":
      return "ticket";
    case "FREE_HOURS":
      return "clock";
    case "MERCH":
      return "merch";
    default:
      return "gift";
  }
}

export function normalizeLootBoxPrizeIconKey(
  iconKey: string | null | undefined,
  rewardType?: string | null,
): LootBoxPrizeIconKey {
  return iconKey === "coins" ||
    iconKey === "discount" ||
    iconKey === "ticket" ||
    iconKey === "clock" ||
    iconKey === "gift" ||
    iconKey === "merch"
    ? iconKey
    : defaultLootBoxPrizeIconKey(rewardType);
}

export function LootBoxPrizeVisual({
  imageUrl,
  iconKey,
  rewardType,
  alt,
  className = "",
}: {
  imageUrl?: string | null;
  iconKey?: string | null;
  rewardType?: string | null;
  alt: string;
  className?: string;
}) {
  const normalizedIconKey = normalizeLootBoxPrizeIconKey(iconKey, rewardType);

  return (
    <span
      className={["lp-prize-visual", className].filter(Boolean).join(" ")}
      data-icon={normalizedIconKey}
    >
      {imageUrl ? (
        // Tenant-owned media URLs are validated by the API before publication.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={alt} src={imageUrl} />
      ) : (
        <LootBoxPrizeIcon iconKey={normalizedIconKey} />
      )}
    </span>
  );
}

function LootBoxPrizeIcon({ iconKey }: { iconKey: LootBoxPrizeIconKey }) {
  if (iconKey === "coins") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        viewBox="0 0 64 64"
      >
        <ellipse cx="32" cy="19" rx="18" ry="8" />
        <path d="M14 19v10c0 4 8 8 18 8s18-4 18-8V19" />
        <path d="M14 29v10c0 4 8 8 18 8s18-4 18-8V29" />
        <path d="M14 39v7c0 4 8 8 18 8s18-4 18-8v-7" />
      </svg>
    );
  }

  if (iconKey === "discount") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        viewBox="0 0 64 64"
      >
        <path d="M11 12h25l17 17-24 24L11 35V12Z" />
        <circle cx="25" cy="25" r="3" />
        <path d="m25 43 15-15m-13 2h.01M38 41h.01" />
      </svg>
    );
  }

  if (iconKey === "ticket") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        viewBox="0 0 64 64"
      >
        <path d="M11 20h42v9a6 6 0 0 0 0 12v9H11v-9a6 6 0 0 0 0-12v-9Z" />
        <path d="M32 22v6m0 8v6m0 8v2" />
      </svg>
    );
  }

  if (iconKey === "clock") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        viewBox="0 0 64 64"
      >
        <circle cx="32" cy="34" r="21" />
        <path d="M32 23v12l9 6M24 8h16M32 8v5" />
      </svg>
    );
  }

  if (iconKey === "merch") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        viewBox="0 0 64 64"
      >
        <path d="m22 14 10 5 10-5 11 8-7 10-5-4v23H23V28l-5 4-7-10 11-8Z" />
        <path d="M27 16c1 4 9 4 10 0" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      viewBox="0 0 64 64"
    >
      <path d="M10 27h44v28H10V27Zm-3-10h50v10H7V17Z" />
      <path d="M32 17v38M18 17c-5-7 2-13 8-8l6 8m14 0c5-7-2-13-8-8l-6 8" />
    </svg>
  );
}

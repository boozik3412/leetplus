import type { GuestGamePromoCard } from "@/lib/guest-gamification";
import { asRecord } from "./helpers";
import type { Store } from "@/lib/stores";
import type {
  PromoBannerUsageSummary,
  PromoBannerUsageInfo,
  PromoBannerForm,
} from "./types";
import {
  PROMO_BANNER_DISPLAY_LIMIT,
  PROMO_BANNER_IMAGE_WIDTH,
  PROMO_BANNER_IMAGE_HEIGHT,
  promoBannerJpegQualities,
  PROMO_BANNER_MAX_DATA_URL_LENGTH,
} from "./constants";

export function clampPromoBannerScale(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(3, Math.max(1, value));
}

export function clampPromoBannerOffset(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(45, Math.max(-45, value));
}

export function promoCardMetadata(promoCard: GuestGamePromoCard) {
  return asRecord(promoCard.metadata);
}

export function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildPromoBannerUsage(
  promoCards: GuestGamePromoCard[],
  stores: Store[],
): PromoBannerUsageSummary {
  const byCardId = new Map<string, PromoBannerUsageInfo>();
  const visibleCardIds = new Set<string>();
  const overflowCardIds = new Set<string>();
  const activeCardIds = new Set<string>();
  const nowMs = Date.now();
  const storeTargets = stores.length
    ? stores.map((store) => ({ id: store.id, name: store.name }))
    : [{ id: "__all__", name: "все клубы" }];
  const activeCards = promoCards
    .filter((promoCard) => promoBannerCanAppear(promoCard, nowMs))
    .sort(comparePromoBannersForPortal);

  activeCards.forEach((promoCard) => activeCardIds.add(promoCard.id));

  const storeUsages = storeTargets
    .map((store) => {
      const eligibleCards = activeCards.filter((promoCard) =>
        promoBannerMatchesStore(promoCard, store.id),
      );

      eligibleCards.forEach((promoCard, index) => {
        const info = promoBannerUsageInfo(byCardId, promoCard.id);

        if (index < PROMO_BANNER_DISPLAY_LIMIT) {
          visibleCardIds.add(promoCard.id);
          info.visibleStoreNames.push(store.name);
        } else {
          overflowCardIds.add(promoCard.id);
          info.overflowStoreNames.push(store.name);
        }
      });

      return {
        storeId: store.id,
        storeName: store.name,
        activeCount: eligibleCards.length,
        visibleCount: Math.min(
          eligibleCards.length,
          PROMO_BANNER_DISPLAY_LIMIT,
        ),
        overflowCount: Math.max(
          eligibleCards.length - PROMO_BANNER_DISPLAY_LIMIT,
          0,
        ),
      };
    })
    .filter((usage) => usage.activeCount > 0);

  return {
    byCardId,
    visibleCardIds,
    overflowCardIds,
    activeCardIds,
    stores: storeUsages,
  };
}

export function promoBannerUsageInfo(
  map: Map<string, PromoBannerUsageInfo>,
  promoCardId: string,
) {
  const current = map.get(promoCardId);

  if (current) {
    return current;
  }

  const next = { visibleStoreNames: [], overflowStoreNames: [] };
  map.set(promoCardId, next);

  return next;
}

export function promoBannerCanAppear(promoCard: GuestGamePromoCard, nowMs: number) {
  return (
    promoCard.status === "ACTIVE" &&
    promoBannerIsInActivePeriod(promoCard, nowMs)
  );
}

export function promoBannerIsInActivePeriod(
  promoCard: GuestGamePromoCard,
  nowMs = Date.now(),
) {
  const fromMs = dateMs(promoCard.periodFrom);
  const toMs = dateMs(promoCard.periodTo);

  if (fromMs !== null && fromMs > nowMs) {
    return false;
  }

  if (toMs !== null && toMs < nowMs) {
    return false;
  }

  return true;
}

export function promoBannerMatchesStore(
  promoCard: GuestGamePromoCard,
  storeId: string,
) {
  return (
    storeId === "__all__" ||
    !promoCard.storeIds.length ||
    promoCard.storeIds.includes(storeId)
  );
}

export function comparePromoBannersForPortal(
  left: GuestGamePromoCard,
  right: GuestGamePromoCard,
) {
  const priorityDelta = right.priority - left.priority;

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const updatedDelta =
    (dateMs(right.updatedAt) ?? 0) - (dateMs(left.updatedAt) ?? 0);

  if (updatedDelta !== 0) {
    return updatedDelta;
  }

  return (dateMs(right.createdAt) ?? 0) - (dateMs(left.createdAt) ?? 0);
}

export function compactStoreNames(names: string[]) {
  const uniqueNames = Array.from(new Set(names));

  if (uniqueNames.length > 2) {
    return `${uniqueNames.slice(0, 2).join(", ")} +${uniqueNames.length - 2}`;
  }

  return uniqueNames.join(", ");
}

export function dateMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : null;
}

export async function renderPromoBannerImage(form: PromoBannerForm) {
  const source = form.imageSource || form.imageUrl;

  if (!source) {
    return "";
  }

  if (!form.imageSource) {
    return form.imageUrl;
  }

  if (typeof window === "undefined") {
    return form.imageUrl || source;
  }

  if (!isInlineImageSource(source)) {
    throw new Error(
      "Картинка баннера должна храниться в LeetPlus. Загрузите изображение файлом и сохраните баннер еще раз.",
    );
  }

  return new Promise<string>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = PROMO_BANNER_IMAGE_WIDTH;
      canvas.height = PROMO_BANNER_IMAGE_HEIGHT;
      const context = canvas.getContext("2d");

      if (!context || !image.naturalWidth || !image.naturalHeight) {
        reject(new Error("Не удалось подготовить изображение баннера."));
        return;
      }

      const scale =
        Math.max(
          PROMO_BANNER_IMAGE_WIDTH / image.naturalWidth,
          PROMO_BANNER_IMAGE_HEIGHT / image.naturalHeight,
        ) * clampPromoBannerScale(Number(form.imageScale));
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const offsetX = clampPromoBannerOffset(Number(form.imageOffsetX));
      const offsetY = clampPromoBannerOffset(Number(form.imageOffsetY));
      const dx =
        (PROMO_BANNER_IMAGE_WIDTH - drawWidth) / 2 +
        (offsetX / 100) * PROMO_BANNER_IMAGE_WIDTH;
      const dy =
        (PROMO_BANNER_IMAGE_HEIGHT - drawHeight) / 2 +
        (offsetY / 100) * PROMO_BANNER_IMAGE_HEIGHT;

      context.fillStyle = "#050b0e";
      context.fillRect(
        0,
        0,
        PROMO_BANNER_IMAGE_WIDTH,
        PROMO_BANNER_IMAGE_HEIGHT,
      );
      context.drawImage(image, dx, dy, drawWidth, drawHeight);

      try {
        const imageDataUrl = promoBannerJpegQualities.reduce<string | null>(
          (best, quality) => {
            if (best && best.length <= PROMO_BANNER_MAX_DATA_URL_LENGTH) {
              return best;
            }

            return canvas.toDataURL("image/jpeg", quality);
          },
          null,
        );

        if (!imageDataUrl) {
          reject(new Error("Не удалось подготовить изображение баннера."));
          return;
        }

        if (imageDataUrl.length > PROMO_BANNER_MAX_DATA_URL_LENGTH) {
          reject(
            new Error(
              "Картинка баннера слишком тяжелая. Загрузите изображение меньшего размера или с меньшим количеством деталей.",
            ),
          );
          return;
        }

        resolve(imageDataUrl);
      } catch {
        reject(
          new Error(
            "Не удалось сохранить картинку баннера у нас. Загрузите изображение файлом, а не внешней ссылкой.",
          ),
        );
      }
    };
    image.onerror = () =>
      reject(new Error("Не удалось загрузить изображение баннера."));
    image.src = source;
  });
}

export function isInlineImageSource(value: string) {
  return value.trim().toLowerCase().startsWith("data:image/");
}

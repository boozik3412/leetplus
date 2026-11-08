"use client";

import type { HomeBanner, BannerTitleStyle, GameNextAction } from "../types";
import {
  isHttpExternalActionUrl,
  isInternalHref,
  normalizeExternalActionUrl,
} from "@/lib/external-links";
import Link from "next/link";
import type { GuestPortalGameSummary } from "@/lib/guest-portal";
import { formatNumber, formatDate } from "../format";

export function HomeBannerGrid({
  banners,
  onToast,
}: {
  banners: HomeBanner[];
  onToast: (message: string) => void;
}) {
  return (
    <div className="lp-club-banner-grid" aria-label="Баннеры клуба">
      {banners.map((banner) => {
        const titleStyle = bannerTitleStyle(banner.title);
        const className = [
          "lp-club-banner",
          banner.featured ? "is-featured" : "",
          banner.imageUrl ? "has-image" : "",
        ].join(" ");
        const isHttpExternal = isHttpExternalActionUrl(banner.href);
        const opensInNewTab =
          isHttpExternal ||
          banner.href === "/game/rewards" ||
          banner.href === "/play/game/rewards";
        const content = (
          <>
            {banner.imageUrl ? (
              <span className="lp-club-banner-media" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={banner.imageUrl} />
              </span>
            ) : null}
            <span className="lp-club-banner-content">
              <span>
                <span className="lp-club-banner-kicker">{banner.label}</span>
                <span className="lp-club-banner-title">{banner.title}</span>
                <span className="lp-club-banner-copy">
                  {banner.description}
                </span>
              </span>
              <span className="lp-club-banner-tag">{banner.tag}</span>
            </span>
          </>
        );

        if (isInternalHref(banner.href)) {
          return (
            <Link
              key={banner.id}
              href={banner.href}
              target={opensInNewTab ? "_blank" : undefined}
              rel={opensInNewTab ? "noreferrer" : undefined}
              className={className}
              style={titleStyle}
              onClick={() => onToast(`Открыт раздел: ${banner.title}.`)}
            >
              {content}
            </Link>
          );
        }

        return (
          <a
            key={banner.id}
            href={banner.href}
            target={isHttpExternal ? "_blank" : undefined}
            rel={isHttpExternal ? "noreferrer" : undefined}
            className={className}
            style={titleStyle}
            onClick={() => onToast(`Открыт раздел: ${banner.title}.`)}
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}

export function bannerTitleStyle(title: string): BannerTitleStyle {
  const size = bannerTitleSize(title);
  const compactSize = bannerCompactTitleSize(size);

  return {
    "--banner-title-size": `${size}px`,
    "--banner-title-line-height": size <= 18 ? "1.08" : "1.05",
    "--banner-title-compact-size": `${compactSize}px`,
    "--banner-title-compact-line-height": compactSize <= 18 ? "1.09" : "1.06",
  };
}

export function bannerCompactTitleSize(size: number) {
  return Math.max(15, Math.round(size * 0.84));
}

export function bannerTitleSize(title: string) {
  const letterCount = Array.from(title).filter((char) =>
    /[\p{L}\p{N}]/u.test(char),
  ).length;

  if (letterCount >= 30) {
    return 16;
  }

  if (letterCount >= 24) {
    return 17;
  }

  if (letterCount >= 20) {
    return 19;
  }

  if (letterCount >= 16) {
    return 21;
  }

  return 24;
}

export function buildHomeBanners(
  summary: GuestPortalGameSummary,
  primaryAction: GameNextAction | null,
  primaryActionHref: string | null,
): HomeBanner[] {
  const featuredMissions = summary.missions.featured;
  const featuredMission = featuredMissions[0] ?? null;
  const secondMission = featuredMissions[1] ?? null;
  const fallbackBanners: HomeBanner[] = [
    {
      id: "primary",
      label: primaryAction ? "Акция / квест" : "Акция / реклама",
      title: primaryAction?.title ?? "Ночной рейд",
      description:
        primaryAction?.description ??
        "Бонусные часы и XP за вечернюю активность в выбранном клубе.",
      tag: primaryAction ? gameActionButtonLabel(primaryAction) : "до 30 июня",
      featured: true,
      href: primaryActionHref ?? "#missions",
    },
    {
      id: "tournament",
      label: "Событие",
      title: featuredMission?.name ?? "Клубный турнир",
      description:
        featuredMission?.rewardLabel ??
        "Соберите стак и получите очки ранга за участие.",
      tag: featuredMission
        ? `${formatNumber(featuredMission.xpReward)} XP`
        : "регистрация",
      href: "#missions",
    },
    {
      id: "drop",
      label: "Событие",
      title: secondMission?.name ?? "Партнерский дроп",
      description:
        secondMission?.rewardLabel ??
        summary.referral.channelHint ??
        "Лимитированные предметы и бонусы для гостей клуба.",
      tag: secondMission ? "квест" : "получить",
      href: "/game/rewards",
    },
    {
      id: "battlepass",
      label: "Сезон",
      title: summary.battlePass.active?.name ?? "Боевой пропуск",
      description:
        summary.battlePass.active?.nextRewardLabel ??
        summary.referral.channelHint ??
        "Проходите задания сезона и забирайте клубные награды.",
      tag: summary.battlePass.active ? "сезон" : "активно",
      href: "#battlePass",
    },
  ];
  const promoBanners = summary.promoCards.featured
    .slice(0, 4)
    .map((card, index): HomeBanner => {
      const actionUrl = normalizeExternalActionUrl(card.actionUrl);

      return {
        id: `promo-${card.id}`,
        label: card.label ?? (index === 0 ? "Акция" : "Событие"),
        title: card.title,
        description:
          card.description ??
          fallbackBanners[index]?.description ??
          "Клубное событие для участников игрового модуля.",
        tag:
          card.tag ??
          (card.periodTo ? `до ${formatDate(card.periodTo)}` : "активно"),
        featured: index === 0,
        href:
          actionUrl ??
          (card.targetAnchor
            ? `#${card.targetAnchor}`
            : (fallbackBanners[index]?.href ?? "#missions")),
        imageUrl: card.imageUrl,
      };
    });

  return [...promoBanners, ...fallbackBanners].slice(0, 4);
}

export function gameActionButtonLabel(action: GameNextAction) {
  const labels = {
    CLAIM_REWARD: "Забрать награду",
    AWAIT_REWARD_HANDOFF: "Мои награды",
    OPEN_LOOT_BOX: "Открыть приз",
    FINISH_MISSION: "Открыть квест",
    BATTLE_PASS: "Открыть сезон",
    CHECK_IN: "Чекин в клубе",
    MATCH_LANGAME: "Связать Langame",
  } satisfies Record<GameNextAction["kind"], string>;

  return labels[action.kind];
}

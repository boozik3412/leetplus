"use client";

import type { ReactNode } from "react";

export type GuestMissionPreviewTheme = "EMERALD" | "VIOLET" | "DARK";

export type GuestMissionPreviewData = {
  title: string;
  description: string;
  condition: string;
  reward: string;
  xp: number;
  progressCurrent: number;
  progressTarget: number;
  progressUnit: string;
  actionText: string;
  theme?: GuestMissionPreviewTheme;
  coverUrl?: string | null;
  products?: string[];
  productMode?: "ANY" | "ALL";
  minimumAmount?: number | null;
};

const missionPreviewPalettes = {
  EMERALD: {
    stage: "bg-emerald-950",
    label: "text-emerald-200/70",
    compact: "border-emerald-200/25 bg-[#0b403a]",
    badge:
      "border-emerald-200/25 bg-emerald-200/5 text-emerald-200",
    muted: "text-emerald-100/65",
    progress: "bg-emerald-300",
    modal: "border-emerald-200/25 bg-[#061a18]",
    hero:
      "bg-gradient-to-br from-[#145348] via-[#087569] to-[#06473f]",
    coverOverlay:
      "linear-gradient(120deg, rgba(3,34,30,.45), rgba(3,55,48,.76))",
    status: "bg-emerald-200/15 text-emerald-100",
    description: "text-emerald-50/75",
    block: "border-white/10 bg-white/[0.035]",
    blockLabel: "text-emerald-100/55",
    product:
      "border-emerald-200/20 bg-emerald-200/[0.07] text-emerald-50",
    reward: "text-emerald-200",
    button: "bg-emerald-300 text-emerald-950",
  },
  VIOLET: {
    stage: "bg-[#150d28]",
    label: "text-violet-200/75",
    compact: "border-violet-200/25 bg-[#302052]",
    badge: "border-violet-200/25 bg-violet-200/10 text-violet-100",
    muted: "text-violet-100/65",
    progress: "bg-violet-300",
    modal: "border-violet-200/25 bg-[#140d24]",
    hero:
      "bg-gradient-to-br from-[#3d246f] via-[#5b2f82] to-[#24133f]",
    coverOverlay:
      "linear-gradient(120deg, rgba(36,19,63,.48), rgba(76,29,149,.72))",
    status: "bg-violet-200/15 text-violet-100",
    description: "text-violet-50/75",
    block: "border-violet-100/10 bg-violet-100/[0.045]",
    blockLabel: "text-violet-100/55",
    product:
      "border-violet-200/20 bg-violet-200/[0.08] text-violet-50",
    reward: "text-violet-200",
    button: "bg-violet-300 text-violet-950",
  },
  DARK: {
    stage: "bg-black",
    label: "text-zinc-400",
    compact: "border-zinc-600/50 bg-zinc-900",
    badge: "border-zinc-600/60 bg-white/5 text-zinc-200",
    muted: "text-zinc-400",
    progress: "bg-zinc-200",
    modal: "border-zinc-700 bg-[#09090b]",
    hero: "bg-gradient-to-br from-zinc-700 via-zinc-900 to-black",
    coverOverlay:
      "linear-gradient(120deg, rgba(9,9,11,.58), rgba(0,0,0,.82))",
    status: "bg-white/10 text-zinc-200",
    description: "text-zinc-300",
    block: "border-zinc-700 bg-zinc-900/70",
    blockLabel: "text-zinc-500",
    product: "border-zinc-700 bg-white/5 text-zinc-200",
    reward: "text-zinc-100",
    button: "bg-zinc-100 text-zinc-950",
  },
} satisfies Record<GuestMissionPreviewTheme, Record<string, string>>;

type MissionPreviewPalette =
  (typeof missionPreviewPalettes)[GuestMissionPreviewTheme];

export function GuestMissionPreview({
  data,
  mode = "both",
  showLabels = true,
  onAction,
}: {
  data: GuestMissionPreviewData;
  mode?: "both" | "compact" | "full";
  showLabels?: boolean;
  onAction?: () => void;
}) {
  const percent = Math.max(
    0,
    Math.min(
      100,
      (data.progressCurrent / Math.max(1, data.progressTarget)) * 100,
    ),
  );
  const progress = `${data.progressCurrent} из ${data.progressTarget} ${data.progressUnit}`;
  const palette = missionPreviewPalettes[data.theme ?? "EMERALD"];

  return (
    <div className={`space-y-5 p-4 text-white ${palette.stage}`}>
      {mode !== "full" ? (
        <div>
          {showLabels ? (
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.18em] ${palette.label}`}
            >
              Компактная карточка
            </p>
          ) : null}
          <div
            className={`${showLabels ? "mt-2" : ""} rounded-xl border p-3 ${palette.compact}`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border text-xs font-black ${palette.badge}`}
              >
                QUEST
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{data.title}</p>
                <p className={`mt-1 text-xs ${palette.muted}`}>{progress}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${palette.progress}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {mode !== "compact" ? (
        <div>
          {showLabels ? (
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.18em] ${palette.label}`}
            >
              Полное модальное окно
            </p>
          ) : null}
          <div
            className={`${showLabels ? "mt-2" : ""} overflow-hidden rounded-2xl border shadow-2xl ${palette.modal}`}
          >
            <div
              className={`relative min-h-44 p-5 ${palette.hero}`}
              style={
                data.coverUrl
                  ? {
                      backgroundImage: `${palette.coverOverlay}, url("${data.coverUrl}")`,
                      backgroundPosition: "center",
                      backgroundSize: "cover",
                    }
                  : undefined
              }
            >
              <span
                className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${palette.status}`}
              >
                Квест в процессе
              </span>
              <h3 className="mt-4 max-w-md text-2xl font-black leading-tight">
                {data.title}
              </h3>
              <p
                className={`mt-2 max-w-md text-sm leading-6 ${palette.description}`}
              >
                {data.description}
              </p>
            </div>
            <div className="space-y-3 p-4">
              <PreviewBlock label="Условие" palette={palette}>
                <p className="text-sm font-bold text-white">{data.condition}</p>
              </PreviewBlock>
              {data.products?.length ? (
                <PreviewBlock
                  palette={palette}
                  label={
                    data.productMode === "ALL"
                      ? "Нужно купить все товары"
                      : "Подойдёт любой товар"
                  }
                >
                  <div className="flex flex-wrap gap-2">
                    {data.products.map((product) => (
                      <span
                        key={product}
                        className={`rounded-full border px-2.5 py-1 text-xs ${palette.product}`}
                      >
                        {product}
                      </span>
                    ))}
                  </div>
                  {data.minimumAmount ? (
                    <p className="mt-2 text-xs font-bold text-amber-200">
                      Минимальная сумма: {data.minimumAmount} ₽
                    </p>
                  ) : null}
                </PreviewBlock>
              ) : null}
              <PreviewBlock label="Прогресс" palette={palette}>
                <div className="flex items-center justify-between gap-3 text-sm font-black">
                  <span>{progress}</span>
                  <span>{Math.round(percent)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${palette.progress}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </PreviewBlock>
              <PreviewBlock label="Награда" palette={palette}>
                <p className={`font-black ${palette.reward}`}>{data.reward}</p>
                {data.xp > 0 ? (
                  <p className="mt-1 text-xs text-zinc-400">
                    Дополнительно: +{data.xp} XP
                  </p>
                ) : null}
              </PreviewBlock>
              <button
                type="button"
                onClick={onAction}
                className={`w-full rounded-lg px-4 py-3 text-sm font-black ${palette.button}`}
              >
                {data.actionText || "Подробнее"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreviewBlock({
  label,
  children,
  palette,
}: {
  label: string;
  children: ReactNode;
  palette: MissionPreviewPalette;
}) {
  return (
    <div className={`rounded-xl border p-3 ${palette.block}`}>
      <p
        className={`mb-2 text-[10px] font-bold uppercase tracking-[0.14em] ${palette.blockLabel}`}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

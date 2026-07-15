"use client";

import type { ReactNode } from "react";

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
  coverUrl?: string | null;
  products?: string[];
  productMode?: "ANY" | "ALL";
  minimumAmount?: number | null;
};

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

  return (
    <div className="space-y-5 bg-zinc-950 p-4 text-white">
      {mode !== "full" ? (
        <div>
          {showLabels ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/70">
              Компактная карточка
            </p>
          ) : null}
          <div
            className={`${showLabels ? "mt-2" : ""} rounded-xl border border-cyan-200/25 bg-[#0c2e46] p-3`}
          >
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-cyan-200/25 bg-cyan-200/5 text-xs font-black text-cyan-200">
                QUEST
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{data.title}</p>
                <p className="mt-1 text-xs text-cyan-100/60">{progress}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-cyan-300"
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
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/70">
              Полное модальное окно
            </p>
          ) : null}
          <div
            className={`${showLabels ? "mt-2" : ""} overflow-hidden rounded-2xl border border-cyan-200/25 bg-[#06151a] shadow-2xl`}
          >
            <div
              className="relative min-h-44 bg-gradient-to-br from-[#123a5f] via-[#075b63] to-[#07383d] p-5"
              style={
                data.coverUrl
                  ? {
                      backgroundImage: `linear-gradient(120deg, rgba(4,20,31,.45), rgba(2,32,35,.7)), url("${data.coverUrl}")`,
                      backgroundPosition: "center",
                      backgroundSize: "cover",
                    }
                  : undefined
              }
            >
              <span className="rounded-full bg-cyan-200/15 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-100">
                Квест в процессе
              </span>
              <h3 className="mt-4 max-w-md text-2xl font-black leading-tight">
                {data.title}
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-cyan-50/75">
                {data.description}
              </p>
            </div>
            <div className="space-y-3 p-4">
              <PreviewBlock label="Условие">
                <p className="text-sm font-bold text-white">{data.condition}</p>
              </PreviewBlock>
              {data.products?.length ? (
                <PreviewBlock
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
                        className="rounded-full border border-cyan-200/20 bg-cyan-200/[0.07] px-2.5 py-1 text-xs text-cyan-50"
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
              <PreviewBlock label="Прогресс">
                <div className="flex items-center justify-between gap-3 text-sm font-black">
                  <span>{progress}</span>
                  <span>{Math.round(percent)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-cyan-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </PreviewBlock>
              <PreviewBlock label="Награда">
                <p className="font-black text-cyan-200">{data.reward}</p>
                {data.xp > 0 ? (
                  <p className="mt-1 text-xs text-zinc-400">
                    Дополнительно: +{data.xp} XP
                  </p>
                ) : null}
              </PreviewBlock>
              <button
                type="button"
                onClick={onAction}
                className="w-full rounded-lg bg-cyan-300 px-4 py-3 text-sm font-black text-zinc-950"
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
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100/55">
        {label}
      </p>
      {children}
    </div>
  );
}

"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type {
  GuestPortalLangameMatchResponse,
  GuestPortalOtpStartResponse,
  GuestPortalOtpVerifyResponse,
  GuestPortalPayload,
  GuestPortalPublicConfig,
} from "@/lib/guest-portal";

type GuestPortalClientProps = {
  tenantSlug: string;
  storeId: string;
};

type LoadState = "loading" | "ready" | "error";

export function GuestPortalClient({
  tenantSlug,
  storeId,
}: GuestPortalClientProps) {
  const [config, setConfig] = useState<GuestPortalPublicConfig | null>(null);
  const [portal, setPortal] = useState<GuestPortalPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] =
    useState<GuestPortalOtpStartResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [langameMatch, setLangameMatch] =
    useState<GuestPortalLangameMatchResponse | null>(null);
  const [langameMatchMessage, setLangameMatchMessage] = useState<string | null>(
    null,
  );
  const [isMatchingLangame, setMatchingLangame] = useState(false);

  const basePath = `/api/guest-portal/${encodeURIComponent(
    tenantSlug,
  )}/${encodeURIComponent(storeId)}`;

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const [configResponse, sessionResponse] = await Promise.all([
          fetch(`${basePath}/public-config`, { cache: "no-store" }),
          fetch("/api/guest-portal/session", { cache: "no-store" }),
        ]);

        if (!isActive) {
          return;
        }

        if (!configResponse.ok) {
          throw new Error(await readMessage(configResponse));
        }

        setConfig((await configResponse.json()) as GuestPortalPublicConfig);

        if (sessionResponse.ok) {
          setPortal((await sessionResponse.json()) as GuestPortalPayload);
        }

        setLoadState("ready");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setMessage(
          error instanceof Error
            ? error.message
            : "Гостевая ссылка недоступна.",
        );
        setLoadState("error");
      }
    }

    void load();

    return () => {
      isActive = false;
    };
  }, [basePath]);

  async function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(`${basePath}/otp/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data = (await response.json()) as GuestPortalOtpStartResponse;
      setChallenge(data);
      setCode("");
      setLangameMatch(null);
      setLangameMatchMessage(null);
      setMessage(
        data.delivery.status === "DEV_CODE"
          ? "Код создан. В demo-режиме он показан ниже."
          : "Канал доставки OTP пока не подключен. Попросите администратора включить SMS, Telegram или MAX.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось создать код.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!challenge) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(`${basePath}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          code,
        }),
      });

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data = (await response.json()) as GuestPortalOtpVerifyResponse;
      setPortal(data.portal);
      setLangameMatch(null);
      setLangameMatchMessage(null);
      setMessage("Профиль подтвержден.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось проверить код.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function checkLangameMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!phone.trim()) {
      setLangameMatchMessage("Введите подтвержденный телефон для проверки.");
      return;
    }

    setMatchingLangame(true);
    setLangameMatchMessage(null);
    setLangameMatch(null);

    try {
      const response = await fetch("/api/guest-portal/session/langame-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data =
        (await response.json()) as GuestPortalLangameMatchResponse;
      setLangameMatch(data);
      setLangameMatchMessage(data.nextAction);
    } catch (error) {
      setLangameMatchMessage(
        error instanceof Error
          ? error.message
          : "Не удалось проверить профиль в Langame.",
      );
    } finally {
      setMatchingLangame(false);
    }
  }

  const pageTitle = portal?.store.name ?? config?.store.name ?? "Клуб";
  const tenantName = portal?.tenant.name ?? config?.tenant.name ?? "LeetPlus";

  return (
    <main className="min-h-screen bg-[#05080d] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(135deg,rgba(13,148,136,0.14),transparent_34%,rgba(14,165,233,0.08)_68%,transparent)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-emerald-300/40 bg-emerald-400/[0.12] text-sm font-black text-emerald-200">
              LP
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-emerald-300">
                Гостевой портал
              </p>
              <h1 className="truncate text-xl font-black text-white sm:text-2xl">
                {pageTitle}
              </h1>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-xs uppercase text-slate-500">Сеть</p>
            <p className="max-w-64 truncate text-sm font-semibold text-slate-200">
              {tenantName}
            </p>
          </div>
        </header>

        {loadState === "loading" ? (
          <LoadingState />
        ) : loadState === "error" || !config ? (
          <ErrorState message={message ?? "Гостевая ссылка недоступна."} />
        ) : portal ? (
          <VerifiedPortal
            portal={portal}
            phone={phone}
            langameMatch={langameMatch}
            langameMatchMessage={langameMatchMessage}
            isMatchingLangame={isMatchingLangame}
            onPhoneChange={setPhone}
            onCheckLangameMatch={checkLangameMatch}
          />
        ) : (
          <VerificationLanding
            config={config}
            phone={phone}
            code={code}
            challenge={challenge}
            message={message}
            isSubmitting={isSubmitting}
            onPhoneChange={setPhone}
            onCodeChange={setCode}
            onSubmitPhone={submitPhone}
            onSubmitCode={submitCode}
          />
        )}
      </div>
    </main>
  );
}

function VerificationLanding({
  config,
  phone,
  code,
  challenge,
  message,
  isSubmitting,
  onPhoneChange,
  onCodeChange,
  onSubmitPhone,
  onSubmitCode,
}: {
  config: GuestPortalPublicConfig;
  phone: string;
  code: string;
  challenge: GuestPortalOtpStartResponse | null;
  message: string | null;
  isSubmitting: boolean;
  onPhoneChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSubmitPhone: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitCode: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="grid flex-1 items-center gap-6 py-8 lg:grid-cols-[1.08fr_0.92fr] lg:py-10">
      <div className="space-y-6">
        <div className="max-w-2xl space-y-5">
          <div className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-2 text-sm font-semibold text-cyan-100">
            <SparkIcon />
            Лояльность, миссии и награды в одном экране
          </div>
          <div className="space-y-4">
            <h2 className="text-4xl font-black leading-tight text-white sm:text-5xl">
              Ваш клубный прогресс уже здесь
            </h2>
            <p className="max-w-xl text-lg leading-8 text-slate-300">
              Подтвердите телефон, чтобы увидеть текущую группу Langame,
              бонусы, доступные лутбоксы, миссии, награды и сезонный battle
              pass без входа во внутренние разделы LeetPlus.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <FeatureBadge
            icon={<ShieldIcon />}
            title="Безопасно"
            text="Только гостевой токен, без доступа к админке."
          />
          <FeatureBadge
            icon={<LootIcon />}
            title="Лутбоксы"
            text="Награды при старте сессии и клубных событиях."
          />
          <FeatureBadge
            icon={<PassIcon />}
            title="Battle pass"
            text="Уровни, XP, бесплатные и premium-награды."
          />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#0b111c] p-4 shadow-2xl shadow-black/30 sm:p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-300">
              Верификация
            </p>
            <h3 className="mt-1 text-2xl font-black text-white">
              Вход для гостей
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {config.store.name}
              {config.store.address ? `, ${config.store.address}` : ""}
            </p>
          </div>
          <ProfileFrame frame="starter" size="sm" />
        </div>

        <form className="space-y-4" onSubmit={onSubmitPhone}>
          <label className="block">
            <span className="text-xs font-bold uppercase text-slate-400">
              Телефон
            </span>
            <input
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value)}
              placeholder="+7 999 000-00-00"
              className="mt-2 w-full rounded-lg border border-white/10 bg-[#070b12] px-4 py-3 text-base font-semibold text-white outline-none transition hover:border-emerald-300/50 focus:border-emerald-300"
              inputMode="tel"
              autoComplete="tel"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-base font-black text-[#02120d] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <KeyIcon />
            Получить код
          </button>
        </form>

        {challenge ? (
          <form
            className="mt-5 space-y-4 border-t border-white/10 pt-5"
            onSubmit={onSubmitCode}
          >
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.08] p-3 text-sm text-emerald-50">
              Код отправлен на {challenge.phoneMasked}. Действует до{" "}
              {formatTime(challenge.expiresAt)}.
              {challenge.delivery.devCode ? (
                <span className="mt-2 block font-black text-emerald-200">
                  Demo-код: {challenge.delivery.devCode}
                </span>
              ) : null}
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-400">
                Код подтверждения
              </span>
              <input
                value={code}
                onChange={(event) => onCodeChange(event.target.value)}
                placeholder="000000"
                className="mt-2 w-full rounded-lg border border-white/10 bg-[#070b12] px-4 py-3 text-center text-2xl font-black text-white outline-none transition hover:border-cyan-300/50 focus:border-cyan-300"
                inputMode="numeric"
                maxLength={6}
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-base font-black text-cyan-100 transition hover:bg-cyan-300/[0.18] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckIcon />
              Подтвердить профиль
            </button>
          </form>
        ) : null}

        {message ? (
          <p
            className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-300"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function VerifiedPortal({
  portal,
  phone,
  langameMatch,
  langameMatchMessage,
  isMatchingLangame,
  onPhoneChange,
  onCheckLangameMatch,
}: {
  portal: GuestPortalPayload;
  phone: string;
  langameMatch: GuestPortalLangameMatchResponse | null;
  langameMatchMessage: string | null;
  isMatchingLangame: boolean;
  onPhoneChange: (value: string) => void;
  onCheckLangameMatch: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="space-y-5 py-6">
      {!portal.guestFound ? (
        <div className="rounded-lg border border-amber-300/30 bg-amber-300/[0.08] p-4 text-sm leading-6 text-amber-50">
          Профиль не найден в синхронизированной базе гостей. Проверьте номер у
          администратора клуба: после синхронизации Langame здесь появятся
          группа лояльности, бонусы и игровой прогресс.
        </div>
      ) : null}

      <LangameMatchPanel
        phone={phone}
        result={langameMatch}
        message={langameMatchMessage}
        isLoading={isMatchingLangame}
        onPhoneChange={onPhoneChange}
        onSubmit={onCheckLangameMatch}
      />

      <NextActionsPanel portal={portal} />

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-white/10 bg-[#0b111c] p-5">
          <div className="flex items-start gap-4">
            <ProfileFrame frame={portal.profile.frame} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase text-emerald-300">
                Профиль гостя
              </p>
              <h2 className="mt-1 truncate text-3xl font-black text-white">
                {portal.profile.displayName}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {portal.profile.contactMasked ?? "Контакт подтвержден"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <Metric label="Уровень" value={portal.profile.level.toString()} />
            <Metric label="XP" value={formatNumber(portal.profile.xp)} />
            <Metric
              label="До уровня"
              value={formatNumber(portal.profile.nextLevelXp)}
            />
          </div>

          <ProgressBar
            label="Прогресс игрового уровня"
            value={portal.profile.levelProgressPercent}
            tone="cyan"
          />
        </div>

        <LoyaltyPanel portal={portal} />
      </section>

      <ActivityPanel portal={portal} />

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <BattlePassPanel portal={portal} />
        <RewardsPanel portal={portal} />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <MissionsPanel portal={portal} />
        <LootBoxesPanel portal={portal} />
      </section>
    </div>
  );
}

function NextActionsPanel({ portal }: { portal: GuestPortalPayload }) {
  const actions = portal.gamification.nextActions;

  if (!actions.length) {
    return null;
  }

  return (
    <section className="rounded-lg border border-emerald-300/20 bg-[#08130f] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-300">
            Что сделать сейчас
          </p>
          <h3 className="mt-1 text-2xl font-black text-white">
            Следующие игровые действия
          </h3>
        </div>
        <span className="rounded-lg border border-emerald-200/20 bg-emerald-300/10 px-3 py-2 text-sm font-bold text-emerald-100">
          {actions.length} в фокусе
        </span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        {actions.map((action) => (
          <article
            key={action.id}
            className={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:border-emerald-200/45 ${nextActionPriorityClass(
              action.priority,
            )}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-lg font-black text-white">
                {nextActionIcon(action.kind)}
              </div>
              <span className="rounded-full bg-black/20 px-2 py-1 text-[10px] font-black uppercase text-emerald-50">
                {action.statusLabel}
              </span>
            </div>
            <p className="mt-3 text-base font-black text-white">
              {action.title}
            </p>
            <p className="mt-2 min-h-14 text-sm leading-6 text-slate-300">
              {action.description}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold uppercase text-slate-400">
              <span>{nextActionAnchorLabel(action.anchor)}</span>
              {action.progressPercent == null ? null : (
                <span>{Math.round(action.progressPercent)}%</span>
              )}
            </div>
            {action.progressPercent == null ? null : (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.10]">
                <div
                  className="h-full rounded-full bg-emerald-300"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(100, action.progressPercent),
                    )}%`,
                  }}
                />
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function LangameMatchPanel({
  phone,
  result,
  message,
  isLoading,
  onPhoneChange,
  onSubmit,
}: {
  phone: string;
  result: GuestPortalLangameMatchResponse | null;
  message: string | null;
  isLoading: boolean;
  onPhoneChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const totalResults =
    result?.sources.reduce((sum, source) => sum + source.resultsCount, 0) ?? 0;

  return (
    <section className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase text-cyan-200">
              Langame
            </p>
            <span className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-xs font-bold text-slate-300">
              ручная проверка
            </span>
          </div>
          <h3 className="mt-2 text-xl font-black text-white">
            Сопоставить профиль гостя
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Если профиль еще не найден в сохраненной базе, можно точечно
            проверить подтвержденный телефон в Langame. Запрос выполняется
            только по кнопке, результат маскируется и не сохраняет сырой
            телефон.
          </p>
        </div>

        <form
          className="grid min-w-0 gap-2 sm:grid-cols-[minmax(220px,1fr)_auto] lg:w-[520px]"
          onSubmit={onSubmit}
        >
          <label className="min-w-0">
            <span className="sr-only">Телефон</span>
            <input
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value)}
              placeholder="+7 999 000-00-00"
              className="w-full rounded-lg border border-white/10 bg-[#070b12] px-4 py-3 text-sm font-semibold text-white outline-none transition hover:border-cyan-300/50 focus:border-cyan-300"
              inputMode="tel"
              autoComplete="tel"
            />
          </label>
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/[0.18] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Проверяем..." : "Проверить"}
          </button>
        </form>
      </div>

      {message ? (
        <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.05] p-3 text-sm leading-6 text-slate-200">
          {message}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-lg px-3 py-1 text-xs font-black uppercase ${langameMatchStatusClass(
                result.status,
              )}`}
            >
              {langameMatchStatusLabel(result.status)}
            </span>
            <span className="text-sm text-slate-400">
              {result.phoneMasked} · {totalResults} совпадений ·{" "}
              {formatTime(result.checkedAt)}
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {result.sources.map((source) => (
              <div
                key={source.id}
                className="rounded-lg border border-white/10 bg-[#080d15] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">
                      {source.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {source.domain}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-black uppercase ${langameSourceStatusClass(
                      source.status,
                    )}`}
                  >
                    {source.status === "SUCCESS" ? "ok" : "error"}
                  </span>
                </div>

                {source.errorMessage ? (
                  <p className="mt-3 text-xs leading-5 text-rose-100">
                    {source.errorMessage}
                  </p>
                ) : source.results.length === 0 ? (
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    Совпадений по источнику нет.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {source.results.slice(0, 3).map((item, index) => (
                      <div
                        key={`${source.id}-${item.externalGuestId ?? index}`}
                        className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-xs leading-5 text-slate-300"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-100">
                            {item.fullNameMasked ??
                              item.phoneMasked ??
                              item.externalGuestId ??
                              "Гость Langame"}
                          </span>
                          {item.localGuestKnown ? (
                            <span className="rounded-lg bg-emerald-300/10 px-2 py-0.5 font-bold text-emerald-200">
                              в LeetPlus
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-slate-400">
                          {[item.phoneMasked, item.emailMasked]
                            .filter(Boolean)
                            .join(" · ") || "Контакты скрыты"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LoyaltyPanel({ portal }: { portal: GuestPortalPayload }) {
  const loyalty = portal.loyalty;

  return (
    <div className="rounded-lg border border-amber-200/20 bg-[#111018] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-amber-200">
            Система лояльности клуба
          </p>
          <h3 className="mt-1 text-2xl font-black text-white">
            {loyalty.groupName ?? "Группа уточняется"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Уровень гостя берется из сохраненных данных Langame и не смешивается
            с игровым XP LeetPlus.
          </p>
        </div>
        <LoyaltyIcon />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric
          label="Скидка"
          value={
            loyalty.discountPercent == null
              ? "-"
              : `${formatNumber(loyalty.discountPercent)}%`
          }
        />
        <Metric
          label="Часы"
          value={
            loyalty.currentHours == null
              ? "-"
              : formatNumber(Math.round(loyalty.currentHours))
          }
        />
        <Metric
          label="Бонусы"
          value={
            loyalty.bonusBalance == null
              ? "-"
              : `${formatNumber(loyalty.bonusBalance)}`
          }
        />
      </div>

      <ProgressBar
        label={
          loyalty.nextGroupName
            ? `До группы ${loyalty.nextGroupName}`
            : "Текущий уровень лояльности"
        }
        value={loyalty.progressPercent}
        tone="gold"
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InfoLine
          label="Баланс"
          value={
            loyalty.balance == null ? "-" : `${formatNumber(loyalty.balance)} руб`
          }
        />
        <InfoLine
          label="Данные обновлены"
          value={
            loyalty.lastSyncedAt ? formatDate(loyalty.lastSyncedAt) : "нет данных"
          }
        />
      </div>
    </div>
  );
}

function ActivityPanel({ portal }: { portal: GuestPortalPayload }) {
  const summary = portal.activity.summary;
  const timeline = portal.activity.timeline;
  const xpHistory = portal.activity.xpHistory;

  return (
    <section className="rounded-lg border border-cyan-200/20 bg-[#09121b] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-cyan-200">
            Активность в клубе
          </p>
          <h3 className="mt-1 text-2xl font-black text-white">
            История прогресса
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Сессии, операции и игровые события берутся из сохраненных snapshot
            данных. Страница не делает живые запросы в Langame при открытии.
          </p>
        </div>
        <div className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 px-3 py-2 text-right text-sm">
          <p className="font-bold text-cyan-100">Последнее событие</p>
          <p className="text-slate-300">
            {summary.lastActivityAt
              ? `${formatDate(summary.lastActivityAt)} ${formatTime(summary.lastActivityAt)}`
              : "нет данных"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Сессии" value={formatNumber(summary.sessionsCount)} />
        <Metric label="Игровое время" value={formatMinutes(summary.playMinutes)} />
        <Metric label="События" value={formatNumber(summary.logsCount)} />
        <Metric label="Баланс" value={formatNumber(summary.transactionsCount)} />
        <Metric label="XP-события" value={formatNumber(summary.gameEventsCount)} />
      </div>

      {xpHistory.length ? (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase text-slate-500">
            Последние начисления XP
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {xpHistory.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDate(item.occurredAt)} {formatTime(item.occurredAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-300/15 px-2 py-1 text-xs font-black text-emerald-100">
                    {item.xpDelta > 0 ? "+" : ""}
                    {item.xpDelta} XP
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">
                  {item.description ?? item.eventType}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <p className="text-xs font-bold uppercase text-slate-500">
          Последние события
        </p>
        {timeline.length ? (
          <div className="mt-2 divide-y divide-white/10 rounded-lg border border-white/10">
            {timeline.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[150px_1fr_auto]"
              >
                <div>
                  <p className="text-sm font-bold text-white">
                    {formatDate(item.occurredAt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatTime(item.occurredAt)}
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-200/10 px-2 py-1 text-xs font-bold uppercase text-cyan-100">
                      {activityKindLabel(item.kind)}
                    </span>
                    <p className="font-bold text-white">{item.title}</p>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {[item.description, item.storeName]
                      .filter(Boolean)
                      .join(" · ") || "Событие сохранено в истории гостя"}
                  </p>
                </div>
                <div className="flex items-start gap-2 sm:justify-end">
                  {item.xpDelta ? (
                    <span className="rounded-full bg-emerald-300/10 px-2 py-1 text-xs font-bold text-emerald-100">
                      {item.xpDelta > 0 ? "+" : ""}
                      {item.xpDelta} XP
                    </span>
                  ) : null}
                  {item.amount != null ? (
                    <span className="rounded-full bg-amber-300/10 px-2 py-1 text-xs font-bold text-amber-100">
                      {formatNumber(item.amount)} руб
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2">
            <EmptyBlock text="История появится после синхронизации сессий, логов, операций баланса и игровых событий гостя." />
          </div>
        )}
      </div>
    </section>
  );
}

function BattlePassPanel({ portal }: { portal: GuestPortalPayload }) {
  const season = portal.gamification.seasons[0] ?? null;
  const levels = season?.levels.length ? season.levels : fallbackBattlePass();
  const reachedLevels =
    season?.reachedLevels ?? levels.filter((level) => level.reached).length;
  const totalLevels = season?.totalLevels ?? levels.length;
  const currentLevel =
    season?.currentLevel ??
    levels.find((level) => level.current)?.level ??
    lastReachedLevel(levels)?.level ??
    1;
  const nextLevel =
    season?.nextLevel ?? levels.find((level) => !level.reached)?.level ?? null;
  const progressPercent =
    season?.progressPercent ?? portal.profile.levelProgressPercent;
  const xpToNextLevel = season?.xpToNextLevel ?? null;
  const nextRewardLabel =
    season?.nextRewardLabel ??
    levels.find((level) => !level.reached)?.freeReward ??
    null;
  const nextPremiumRewardLabel =
    season?.nextPremiumRewardLabel ??
    levels.find((level) => !level.reached)?.premiumReward ??
    null;

  return (
    <div className="rounded-lg border border-white/10 bg-[#0b111c] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-cyan-200">
            Battle pass
          </p>
          <h3 className="mt-1 text-2xl font-black text-white">
            {season?.name ?? "Клубный сезон"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Бесплатная дорожка и premium-награды отображаются отдельно. Выдача
            наград проходит через LeetPlus, без автоматической записи в Langame.
          </p>
        </div>
        <PassIcon />
      </div>

      <div className="mt-5 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.07] p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Текущий уровень" value={`LVL ${currentLevel}`} />
          <Metric
            label="Пройдено"
            value={`${formatNumber(reachedLevels)}/${formatNumber(totalLevels)}`}
          />
          <Metric
            label="До следующего"
            value={
              xpToNextLevel == null ? "Финиш" : `${formatNumber(xpToNextLevel)} XP`
            }
          />
          <Metric
            label="Награды сезона"
            value={formatNumber(
              (season?.readyRewards ?? 0) +
                (season?.waitingApprovalRewards ?? 0) +
                (season?.redeemedRewards ?? 0),
            )}
          />
        </div>

        <ProgressBar
          label={
            nextLevel
              ? `До уровня ${nextLevel}`
              : "Сезонный прогресс завершен"
          }
          value={progressPercent}
          tone="cyan"
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <InfoLine
            label="Следующая free-награда"
            value={nextRewardLabel ?? "Награда появится в настройках сезона"}
          />
          <InfoLine
            label="Следующая premium-награда"
            value={
              season?.premiumEnabled
                ? nextPremiumRewardLabel ?? "Premium-награда не задана"
                : "Premium-дорожка не включена"
            }
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {levels.slice(0, 8).map((level) => (
          <div
            key={`${level.level}-${level.xp}`}
            className={`rounded-lg border p-3 transition ${
              level.current
                ? "border-cyan-300/50 bg-cyan-300/10"
                : level.next
                  ? "border-amber-300/40 bg-amber-300/10"
                  : level.reached
                    ? "border-emerald-300/40 bg-emerald-300/10"
                    : "border-white/10 bg-[#070b12]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase text-slate-400">
                LVL {level.level}
              </span>
              {level.current ? (
                <span className="rounded-full bg-cyan-300/15 px-2 py-1 text-[10px] font-black uppercase text-cyan-100">
                  сейчас
                </span>
              ) : level.next ? (
                <span className="rounded-full bg-amber-300/15 px-2 py-1 text-[10px] font-black uppercase text-amber-100">
                  цель
                </span>
              ) : level.reached ? (
                <CheckIcon />
              ) : (
                <LockIcon />
              )}
            </div>
            <p className="mt-2 text-sm font-black text-white">
              {formatNumber(level.xp)} XP
            </p>
            <div className="mt-2 min-h-16 space-y-1 text-xs leading-5 text-slate-400">
              <p>{level.freeReward ?? "Награда сезона"}</p>
              {season?.premiumEnabled && level.premiumReward ? (
                <p className="text-amber-100/90">Premium: {level.premiumReward}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RewardsPanel({ portal }: { portal: GuestPortalPayload }) {
  const summary = portal.gamification.rewardSummary;
  const rewards = portal.gamification.rewards;
  const readyReward =
    rewards.find((reward) => reward.walletState === "READY") ?? null;

  return (
    <div className="rounded-lg border border-white/10 bg-[#0b111c] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-300">
            Награды
          </p>
          <h3 className="mt-1 text-2xl font-black text-white">
            Кошелек гостя
          </h3>
        </div>
        <WalletIcon />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Всего" value={formatNumber(summary.total)} />
        <Metric label="Можно забрать" value={formatNumber(summary.ready)} />
        <Metric label="На проверке" value={formatNumber(summary.waitingApproval)} />
        <Metric label="Получено" value={formatNumber(summary.redeemed)} />
      </div>

      {readyReward ? (
        <div className="mt-4 rounded-lg border border-emerald-300/35 bg-emerald-300/[0.10] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-emerald-200">
                Готово к выдаче
              </p>
              <p className="mt-1 text-lg font-black text-white">
                {readyReward.rewardLabel}
              </p>
              <p className="mt-1 text-sm leading-6 text-emerald-50/80">
                Покажите код администратору клуба. Награда доступна только в этом
                клубе или как сетевая награда.
              </p>
            </div>
            {readyReward.expiresAt ? (
              <span className="rounded-lg border border-emerald-200/20 px-2 py-1 text-xs font-bold text-emerald-100">
                До {formatDate(readyReward.expiresAt)}
              </span>
            ) : null}
          </div>
          {readyReward.rewardCode ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_88px]">
              <p className="rounded-lg border border-dashed border-emerald-200/50 bg-[#06120d] px-3 py-2 text-sm font-black text-emerald-50">
                Код кассиру: {readyReward.rewardCode}
              </p>
              {readyReward.claimPayload ? (
                <RewardClaimBadge payload={readyReward.claimPayload} />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {rewards.length ? (
          rewards.slice(0, 5).map((reward) => (
            <div
              key={reward.id}
              className="rounded-lg border border-white/10 bg-[#070b12] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-white">{reward.rewardLabel}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(reward.qualifiedAt)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {rewardSourceLabel(reward.sourceKind)}
                    {reward.sourceLabel ? `: ${reward.sourceLabel}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-lg px-2 py-1 text-xs font-black ${walletStateClass(
                    reward.walletState,
                  )}`}
                >
                  {walletStateLabel(reward.walletState)}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                {walletStateHint(reward.walletState)}
                {reward.expiresAt ? ` До ${formatDate(reward.expiresAt)}.` : ""}
              </p>
              {reward.rewardCode && reward.walletState === "READY" ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_88px]">
                  <p className="rounded-lg border border-dashed border-cyan-300/30 px-3 py-2 text-sm font-black text-cyan-100">
                    Код кассиру: {reward.rewardCode}
                  </p>
                  {reward.claimPayload ? (
                    <RewardClaimBadge payload={reward.claimPayload} />
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyBlock text="Награды появятся после миссий, лутбоксов или ручного подтверждения администратором." />
        )}
      </div>
    </div>
  );
}

function MissionsPanel({ portal }: { portal: GuestPortalPayload }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b111c] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-cyan-200">Миссии</p>
          <h3 className="mt-1 text-2xl font-black text-white">
            Доступные задания
          </h3>
        </div>
        <MissionIcon />
      </div>
      <div className="mt-5 space-y-3">
        {portal.gamification.missions.length ? (
          portal.gamification.missions.map((mission) => {
            const progressTarget = mission.progressTarget ?? 1;
            const progressUnit = mission.progressUnit
              ? ` ${mission.progressUnit}`
              : "";
            const progressLabel =
              mission.progressPercent >= 100
                ? `Выполнено: ${mission.progressCurrent}/${progressTarget}${progressUnit}`
                : `Прогресс: ${mission.progressCurrent}/${progressTarget}${progressUnit}`;

            return (
              <div
                key={mission.id}
                className="rounded-lg border border-white/10 bg-[#070b12] p-4 transition hover:border-cyan-300/35"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-white">{mission.name}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {mission.rewardLabel ?? "Награда после подтверждения"}
                    </p>
                  </div>
                  <span className="rounded-lg bg-cyan-300/10 px-2 py-1 text-xs font-black text-cyan-100">
                    +{mission.xpReward} XP
                  </span>
                </div>
                <ProgressBar
                  label={progressLabel}
                  value={mission.progressPercent}
                  tone="cyan"
                />
              </div>
            );
          })
        ) : (
          <EmptyBlock text="Активные миссии для этого клуба пока не настроены." />
        )}
      </div>
    </div>
  );
}

function LootBoxesPanel({ portal }: { portal: GuestPortalPayload }) {
  const [openedLootBoxId, setOpenedLootBoxId] = useState<string | null>(null);
  const lootBoxes = portal.gamification.lootBoxes;

  return (
    <div className="rounded-lg border border-white/10 bg-[#0b111c] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-300">
            Лутбоксы
          </p>
          <h3 className="mt-1 text-2xl font-black text-white">
            Событийные награды
          </h3>
        </div>
        <LootIcon />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {lootBoxes.length ? (
          lootBoxes.map((lootBox) => {
            const latestReward = lootBox.latestReward;
            const isOpened = openedLootBoxId === lootBox.id;

            return (
              <div
                key={lootBox.id}
                className={`rounded-lg border p-4 transition hover:border-emerald-300/40 ${
                  latestReward
                    ? "border-emerald-300/30 bg-emerald-300/[0.07]"
                    : "border-white/10 bg-[#070b12]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-white">{lootBox.name}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {lootBox.rewardLabel ??
                        "Награда определяется правилами лутбокса."}
                    </p>
                  </div>
                  <span className="rounded-lg bg-emerald-300/10 px-2 py-1 text-xs font-black text-emerald-200">
                    {lootBox.triggerKind}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Metric
                    label="Сработал"
                    value={formatNumber(lootBox.openedCount)}
                  />
                  <Metric
                    label="К выдаче"
                    value={formatNumber(lootBox.readyRewards)}
                  />
                  <Metric
                    label="Получено"
                    value={formatNumber(lootBox.redeemedRewards)}
                  />
                </div>

                {latestReward ? (
                  <div className="mt-3 rounded-lg border border-emerald-300/25 bg-[#06120d] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold uppercase text-emerald-200">
                          Последний лутбокс
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatDate(latestReward.qualifiedAt)}
                        </p>
                      </div>
                      <span
                        className={`rounded-lg px-2 py-1 text-xs font-black ${walletStateClass(
                          latestReward.walletState,
                        )}`}
                      >
                        {walletStateLabel(latestReward.walletState)}
                      </span>
                    </div>

                    {!isOpened ? (
                      <button
                        type="button"
                        className="mt-3 w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-black text-[#03110a] transition hover:bg-emerald-300"
                        onClick={() => setOpenedLootBoxId(lootBox.id)}
                        aria-expanded={false}
                      >
                        Открыть лутбокс
                      </button>
                    ) : (
                      <div className="mt-3 rounded-lg border border-emerald-200/25 bg-emerald-300/[0.08] p-3">
                        <p className="text-xs font-bold uppercase text-emerald-200">
                          Выпала награда
                        </p>
                        <p className="mt-1 text-lg font-black text-white">
                          {latestReward.rewardLabel}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-300">
                          {walletStateHint(latestReward.walletState)}
                          {latestReward.expiresAt
                            ? ` До ${formatDate(latestReward.expiresAt)}.`
                            : ""}
                        </p>
                        {latestReward.rewardCode &&
                        latestReward.walletState === "READY" ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_88px]">
                            <p className="rounded-lg border border-dashed border-emerald-200/50 px-3 py-2 text-sm font-black text-emerald-50">
                              Код кассиру: {latestReward.rewardCode}
                            </p>
                            {latestReward.claimPayload ? (
                              <RewardClaimBadge
                                payload={latestReward.claimPayload}
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-400">
                    Лутбокс откроется после подходящего события: старта сессии,
                    миссии или другого правила, заданного клубом.
                  </p>
                )}
              </div>
            );
          })
        ) : (
          <EmptyBlock text="Лутбоксы появятся после настройки правил старта сессии или клубных событий." />
        )}
      </div>
    </div>
  );
}

function FeatureBadge({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-3 text-emerald-200">{icon}</div>
      <p className="font-black text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-black text-white">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="truncate font-bold text-white">{value}</span>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "gold";
}) {
  const normalized = Math.max(0, Math.min(100, value));
  const color = tone === "gold" ? "bg-amber-300" : "bg-cyan-300";

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase text-slate-400">
        <span>{label}</span>
        <span>{normalized}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-lg bg-white/[0.08]">
        <div
          className={`h-full rounded-lg ${color}`}
          style={{ width: `${normalized}%` }}
        />
      </div>
    </div>
  );
}

function ProfileFrame({
  frame,
  size = "md",
}: {
  frame: GuestPortalPayload["profile"]["frame"];
  size?: "sm" | "md";
}) {
  const palette = {
    starter: "border-slate-400/40 bg-slate-400/10 text-slate-200",
    bronze: "border-orange-300/50 bg-orange-300/10 text-orange-100",
    silver: "border-cyan-200/50 bg-cyan-200/10 text-cyan-100",
    gold: "border-amber-200/60 bg-amber-200/[0.12] text-amber-100",
    diamond: "border-emerald-200/60 bg-emerald-200/[0.12] text-emerald-100",
  }[frame];
  const className =
    size === "sm"
      ? "size-14 text-lg"
      : "size-20 text-2xl sm:size-24 sm:text-3xl";

  return (
    <div
      className={`${className} relative flex shrink-0 items-center justify-center rounded-lg border-2 ${palette} font-black`}
    >
      <span>LP</span>
      <span className="absolute -right-1 -top-1 size-3 rounded-full bg-emerald-300" />
      <span className="absolute -bottom-1 -left-1 size-3 rounded-full bg-cyan-300" />
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/[0.14] bg-white/[0.03] p-4 text-sm leading-6 text-slate-400">
      {text}
    </div>
  );
}

function RewardClaimBadge({ payload }: { payload: string }) {
  const cells = Array.from({ length: 25 }, (_, index) => {
    const charCode = payload.charCodeAt(index % payload.length);
    return (charCode + index * 7) % 3 !== 0;
  });

  return (
    <div
      className="grid size-[88px] grid-cols-5 gap-1 rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-2"
      title={payload}
      aria-label="Данные для проверки награды кассиром"
    >
      {cells.map((active, index) => (
        <span
          key={`${payload}-${index}`}
          className={`rounded-[2px] ${active ? "bg-cyan-100" : "bg-transparent"}`}
        />
      ))}
    </div>
  );
}

function walletStateLabel(
  state: GuestPortalPayload["gamification"]["rewards"][number]["walletState"],
) {
  const labels = {
    WAITING_APPROVAL: "Ждет подтверждения",
    READY: "Готово к выдаче",
    REDEEMED: "Выдано",
    CANCELED: "Отменено",
    EXPIRED: "Сгорело",
  } satisfies Record<
    GuestPortalPayload["gamification"]["rewards"][number]["walletState"],
    string
  >;

  return labels[state];
}

function walletStateClass(
  state: GuestPortalPayload["gamification"]["rewards"][number]["walletState"],
) {
  const classes = {
    WAITING_APPROVAL: "bg-amber-300/10 text-amber-100",
    READY: "bg-emerald-300/10 text-emerald-200",
    REDEEMED: "bg-cyan-300/10 text-cyan-100",
    CANCELED: "bg-slate-300/10 text-slate-300",
    EXPIRED: "bg-rose-300/10 text-rose-100",
  } satisfies Record<
    GuestPortalPayload["gamification"]["rewards"][number]["walletState"],
    string
  >;

  return classes[state];
}

function rewardSourceLabel(
  sourceKind: GuestPortalPayload["gamification"]["rewards"][number]["sourceKind"],
) {
  const labels = {
    LOOT_BOX: "Лутбокс",
    MISSION: "Миссия",
    BATTLE_PASS: "Battle pass",
    MANUAL: "Ручная награда",
  } satisfies Record<
    GuestPortalPayload["gamification"]["rewards"][number]["sourceKind"],
    string
  >;

  return labels[sourceKind];
}

function walletStateHint(
  state: GuestPortalPayload["gamification"]["rewards"][number]["walletState"],
) {
  const hints = {
    WAITING_APPROVAL: "Сотрудник клуба проверит награду и подготовит выдачу.",
    READY: "Покажите код кассиру в клубе, чтобы получить награду.",
    REDEEMED: "Награда уже выдана и отмечена в LeetPlus.",
    CANCELED: "Награда отменена сотрудником клуба.",
    EXPIRED: "Срок действия награды закончился.",
  } satisfies Record<
    GuestPortalPayload["gamification"]["rewards"][number]["walletState"],
    string
  >;

  return hints[state];
}

function nextActionIcon(
  kind: GuestPortalPayload["gamification"]["nextActions"][number]["kind"],
) {
  const labels = {
    CLAIM_REWARD: "₽",
    OPEN_LOOT_BOX: "LB",
    FINISH_MISSION: "M",
    BATTLE_PASS: "BP",
    MATCH_LANGAME: "L",
  } satisfies Record<
    GuestPortalPayload["gamification"]["nextActions"][number]["kind"],
    string
  >;

  return labels[kind];
}

function nextActionPriorityClass(
  priority: GuestPortalPayload["gamification"]["nextActions"][number]["priority"],
) {
  const classes = {
    HIGH: "border-emerald-300/40 bg-emerald-300/[0.10]",
    MEDIUM: "border-cyan-300/25 bg-cyan-300/[0.07]",
    LOW: "border-white/10 bg-[#070b12]",
  } satisfies Record<
    GuestPortalPayload["gamification"]["nextActions"][number]["priority"],
    string
  >;

  return classes[priority];
}

function nextActionAnchorLabel(
  anchor: GuestPortalPayload["gamification"]["nextActions"][number]["anchor"],
) {
  const labels = {
    rewards: "Кошелек",
    lootBoxes: "Лутбоксы",
    missions: "Миссии",
    battlePass: "Battle pass",
    profile: "Профиль",
  } satisfies Record<
    GuestPortalPayload["gamification"]["nextActions"][number]["anchor"],
    string
  >;

  return labels[anchor];
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="rounded-lg border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-semibold text-slate-300">
        Загружаем гостевой портал...
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="max-w-xl rounded-lg border border-red-300/30 bg-red-300/[0.08] p-5">
        <p className="text-xl font-black text-white">Страница недоступна</p>
        <p className="mt-2 text-sm leading-6 text-red-100">{message}</p>
      </div>
    </div>
  );
}

type BattlePassLevel =
  GuestPortalPayload["gamification"]["seasons"][number]["levels"][number];

function fallbackBattlePass(): BattlePassLevel[] {
  return [
    {
      level: 1,
      xp: 0,
      freeReward: "Старт сезона",
      premiumReward: null,
      reached: true,
      current: true,
      next: false,
    },
    {
      level: 2,
      xp: 250,
      freeReward: "Промокод бара",
      premiumReward: "Усиленная награда",
      reached: false,
      current: false,
      next: true,
    },
    {
      level: 3,
      xp: 500,
      freeReward: "Бонус визита",
      premiumReward: "Лутбокс",
      reached: false,
      current: false,
      next: false,
    },
    {
      level: 4,
      xp: 900,
      freeReward: "Часы игры",
      premiumReward: "Премиум-приз",
      reached: false,
      current: false,
      next: false,
    },
  ];
}

function lastReachedLevel(levels: BattlePassLevel[]) {
  const reached = levels.filter((level) => level.reached);
  return reached[reached.length - 1] ?? null;
}

async function readMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: unknown };
    return typeof data.message === "string" ? data.message : "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
    value,
  );
}

function formatMinutes(value: number) {
  if (value < 60) {
    return `${formatNumber(value)} мин`;
  }

  return `${formatNumber(value / 60)} ч`;
}

function langameMatchStatusLabel(
  status: GuestPortalLangameMatchResponse["status"],
) {
  const labels = {
    MATCHED_LOCAL: "найдено в LeetPlus",
    FOUND_IN_LANGAME: "найдено в Langame",
    NOT_FOUND: "не найдено",
    FAILED: "ошибка проверки",
  } satisfies Record<GuestPortalLangameMatchResponse["status"], string>;

  return labels[status];
}

function langameMatchStatusClass(
  status: GuestPortalLangameMatchResponse["status"],
) {
  const classes = {
    MATCHED_LOCAL: "bg-emerald-300/10 text-emerald-200",
    FOUND_IN_LANGAME: "bg-cyan-300/10 text-cyan-100",
    NOT_FOUND: "bg-amber-300/10 text-amber-100",
    FAILED: "bg-rose-300/10 text-rose-100",
  } satisfies Record<GuestPortalLangameMatchResponse["status"], string>;

  return classes[status];
}

function langameSourceStatusClass(status: "SUCCESS" | "FAILED") {
  return status === "SUCCESS"
    ? "bg-emerald-300/10 text-emerald-200"
    : "bg-rose-300/10 text-rose-100";
}

function activityKindLabel(
  kind: GuestPortalPayload["activity"]["timeline"][number]["kind"],
) {
  const labels = {
    SESSION: "сессия",
    LOG: "история",
    TRANSACTION: "баланс",
    GAME_EVENT: "игра",
  } satisfies Record<
    GuestPortalPayload["activity"]["timeline"][number]["kind"],
    string
  >;

  return labels[kind];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function SparkIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l1.7 6.1L20 10l-6.3 1.9L12 18l-1.7-6.1L4 10l6.3-1.9L12 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="size-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l7 3v5.6c0 4.2-2.9 7.4-7 8.4-4.1-1-7-4.2-7-8.4V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M9 12l2 2 4-5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LootIcon() {
  return (
    <svg className="size-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8l8-4 8 4v9l-8 4-8-4V8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M4 8l8 4 8-4M12 12v9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 6.5l6 3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function PassIcon() {
  return (
    <svg className="size-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 5h14v14H5V5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 9h8M8 13h5M8 17h7" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function MissionIcon() {
  return (
    <svg className="size-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4h10l2 4-7 12L5 8l2-4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 9h8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LoyaltyIcon() {
  return (
    <svg className="size-10 text-amber-200" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="size-8 text-emerald-200" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16v13H4V7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M7 7l10-3 1 3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 14h3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 14a4 4 0 1 1 3-1.3L21 4l2 2-2 2-2-2-2 2 2 2-2 2-2-2-2.7 2.7A4 4 0 0 1 9 14z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6V10z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

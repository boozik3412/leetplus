"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  GUEST_GAME_ACCOUNTS_PATH,
  faceitStatusText,
  readSteamOpenIdReturn,
  type GuestGameAccounts,
} from "@/lib/guest-game-accounts";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: GuestGameAccounts }
  | { kind: "auth-required" }
  | { kind: "error"; message: string };

class AuthRequiredError extends Error {}

const STEAM_LOGIN_PREFIX = "https://steamcommunity.com/openid/login?";

async function request<T>(
  path: string,
  init: RequestInit | undefined,
  fallback: string,
): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) {
    let message = fallback;
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // keep the fallback
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function post<T>(action: string, body: unknown, fallback: string) {
  return request<T>(
    `${GUEST_GAME_ACCOUNTS_PATH}/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    },
    fallback,
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

export function GameAccountsClient() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<"link" | "unlink" | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const handledReturn = useRef(false);

  function fail(error: unknown, fallback: string) {
    if (error instanceof AuthRequiredError) {
      setState({ kind: "auth-required" });
      return;
    }
    setNotice({
      tone: "error",
      text: error instanceof Error ? error.message : fallback,
    });
  }

  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    let active = true;

    async function start() {
      const steamReturn = readSteamOpenIdReturn(window.location.search);

      if (steamReturn) {
        // Drop the one-time Steam answer from the address bar and history.
        window.history.replaceState(null, "", window.location.pathname);

        if (Object.keys(steamReturn.openid).length === 0) {
          setNotice({ tone: "error", text: "Вход через Steam отменён." });
        } else {
          try {
            const data = await post<GuestGameAccounts>(
              "steam-verify",
              steamReturn,
              "Не удалось привязать Steam.",
            );
            if (!active) return;
            setState({ kind: "ready", data });
            setNotice({ tone: "ok", text: "Steam привязан." });
            return;
          } catch (error) {
            if (!active) return;
            fail(error, "Не удалось привязать Steam.");
            if (error instanceof AuthRequiredError) return;
          }
        }
      }

      try {
        const data = await request<GuestGameAccounts>(
          GUEST_GAME_ACCOUNTS_PATH,
          undefined,
          "Не удалось загрузить игровые аккаунты.",
        );
        if (active) setState({ kind: "ready", data });
      } catch (error) {
        if (!active) return;
        if (error instanceof AuthRequiredError) {
          setState({ kind: "auth-required" });
        } else {
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Не удалось загрузить игровые аккаунты.",
          });
        }
      }
    }

    void start();
    return () => {
      active = false;
    };
  }, []);

  async function linkSteam() {
    setBusy("link");
    setNotice(null);
    try {
      const { redirectUrl } = await post<{ redirectUrl: string }>(
        "steam-start",
        {},
        "Не удалось начать вход через Steam.",
      );
      if (!redirectUrl.startsWith(STEAM_LOGIN_PREFIX)) {
        throw new Error("Не удалось начать вход через Steam.");
      }
      window.location.assign(redirectUrl);
    } catch (error) {
      fail(error, "Не удалось начать вход через Steam.");
      setBusy(null);
    }
  }

  async function unlinkSteam() {
    setBusy("unlink");
    setNotice(null);
    try {
      const data = await post<GuestGameAccounts>(
        "steam-unlink",
        {},
        "Не удалось отвязать Steam.",
      );
      setState({ kind: "ready", data });
      setNotice({ tone: "ok", text: "Steam отвязан." });
    } catch (error) {
      fail(error, "Не удалось отвязать Steam.");
    } finally {
      setBusy(null);
      setConfirmUnlink(false);
    }
  }

  return (
    <main className="lp-accounts-page">
      <div className="lp-accounts-shell">
        <header className="lp-accounts-topbar">
          <Link href="/game" className="lp-accounts-icon-button" aria-label="Назад к игре">
            <BackIcon />
          </Link>
          <div>
            <span className="lp-accounts-eyebrow">Игровой модуль</span>
            <h1>Игровые аккаунты</h1>
          </div>
        </header>

        {notice ? (
          <p
            className={`lp-accounts-notice is-${notice.tone}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}

        {state.kind === "loading" ? (
          <div className="lp-accounts-skeleton" aria-busy="true" aria-label="Загружаем аккаунты">
            <span />
            <span />
          </div>
        ) : null}

        {state.kind === "auth-required" ? (
          <section className="lp-accounts-card">
            <h2>Войдите в игру</h2>
            <p>Игровые аккаунты привязываются к вашему игровому профилю.</p>
            <Link href="/game/auth" className="lp-accounts-primary">
              Перейти ко входу
            </Link>
          </section>
        ) : null}

        {state.kind === "error" ? (
          <section className="lp-accounts-card">
            <h2>Не загрузилось</h2>
            <p>{state.message}</p>
            <button
              type="button"
              className="lp-accounts-primary"
              onClick={() => window.location.reload()}
            >
              Повторить
            </button>
          </section>
        ) : null}

        {state.kind === "ready" && !state.data.enabled ? (
          <section className="lp-accounts-card">
            <h2>Скоро</h2>
            <p>Задания за матчи FACEIT в этом клубе пока не включены.</p>
            <Link href="/game" className="lp-accounts-primary">
              Вернуться в игру
            </Link>
          </section>
        ) : null}

        {state.kind === "ready" && state.data.enabled ? (
          <>
            <section className="lp-accounts-card" aria-labelledby="steamTitle">
              <div className="lp-accounts-row">
                {state.data.steam?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={state.data.steam.avatarUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="lp-accounts-avatar"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="lp-accounts-avatar is-empty" aria-hidden="true">
                    S
                  </span>
                )}
                <div className="lp-accounts-main">
                  <h2 id="steamTitle">Steam</h2>
                  {state.data.steam ? (
                    <p>
                      <a href={state.data.steam.profileUrl} target="_blank" rel="noreferrer">
                        {state.data.steam.nickname ?? state.data.steam.steamId}
                      </a>
                      {" · привязан "}
                      {formatDate(state.data.steam.linkedAt)}
                    </p>
                  ) : (
                    <p>Не привязан. Вход только через сайт Steam, пароль мы не видим.</p>
                  )}
                </div>
              </div>

              {state.data.steam ? (
                confirmUnlink ? (
                  <div className="lp-accounts-actions">
                    <p className="lp-accounts-hint">
                      Сменить Steam потом можно только через 30 дней. Отвязать?
                    </p>
                    <button
                      type="button"
                      className="lp-accounts-danger"
                      disabled={busy !== null}
                      onClick={unlinkSteam}
                    >
                      {busy === "unlink" ? "Отвязываем…" : "Да, отвязать"}
                    </button>
                    <button
                      type="button"
                      className="lp-accounts-secondary"
                      disabled={busy !== null}
                      onClick={() => setConfirmUnlink(false)}
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="lp-accounts-secondary"
                    onClick={() => setConfirmUnlink(true)}
                  >
                    Отвязать Steam
                  </button>
                )
              ) : state.data.relinkAvailableAt ? (
                <p className="lp-accounts-hint">
                  Привязать Steam снова можно с {formatDate(state.data.relinkAvailableAt)}.
                </p>
              ) : (
                <button
                  type="button"
                  className="lp-accounts-primary"
                  disabled={busy !== null}
                  onClick={linkSteam}
                >
                  {busy === "link" ? "Открываем Steam…" : "Войти через Steam"}
                </button>
              )}
            </section>

            <section className="lp-accounts-card" aria-labelledby="faceitTitle">
              <div className="lp-accounts-row">
                <span className="lp-accounts-avatar is-faceit" aria-hidden="true">
                  F
                </span>
                <div className="lp-accounts-main">
                  <h2 id="faceitTitle">FACEIT</h2>
                  <p>{faceitStatusText(state.data)}</p>
                  {state.data.faceit?.status === "FOUND" &&
                  (state.data.faceit.level || state.data.faceit.elo) ? (
                    <p className="lp-accounts-stats">
                      {state.data.faceit.level ? `Уровень ${state.data.faceit.level}` : null}
                      {state.data.faceit.level && state.data.faceit.elo ? " · " : null}
                      {state.data.faceit.elo ? `ELO ${state.data.faceit.elo}` : null}
                    </p>
                  ) : null}
                </div>
              </div>
              {state.data.faceit?.profileUrl ? (
                <a
                  className="lp-accounts-secondary"
                  href={state.data.faceit.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Профиль на FACEIT
                </a>
              ) : null}
            </section>

            <section className="lp-accounts-card is-quiet">
              <h2>Как засчитываются матчи</h2>
              <p>
                В заданиях засчитываются только матчи FACEIT CS2, сыгранные в клубе во
                время вашей оплаченной сессии. Матчи из дома не идут в зачёт.
              </p>
            </section>
          </>
        ) : null}
      </div>
      <style>{accountsCss}</style>
    </main>
  );
}

function BackIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

const accountsCss = `
.lp-accounts-page {
  min-height: 100vh;
  color: #edf7f8;
  background:
    radial-gradient(circle at 80% 0%, rgba(131, 228, 236, 0.08), transparent 32%),
    #000;
  overflow-x: hidden;
}
.lp-accounts-page *, .lp-accounts-page *::before, .lp-accounts-page *::after { box-sizing: border-box; }
.lp-accounts-shell { width: min(640px, 100%); margin: 0 auto; padding: 0 16px 96px; display: grid; gap: 12px; }
.lp-accounts-topbar { display: flex; align-items: center; gap: 12px; padding: 16px 0 4px; }
.lp-accounts-topbar h1 { margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.01em; }
.lp-accounts-eyebrow { display: block; color: #a8b9ba; font-size: 12px; }
.lp-accounts-icon-button {
  display: inline-grid; place-items: center; width: 44px; height: 44px; flex: 0 0 auto;
  border: 1px solid rgba(196, 224, 225, 0.2); border-radius: 8px;
  color: #edf7f8; background: rgba(196, 224, 225, 0.035);
}
.lp-accounts-card {
  display: grid; gap: 12px; padding: 14px 16px;
  border: 1px solid rgba(196, 224, 225, 0.16); border-radius: 8px;
  background: rgba(8, 14, 18, 0.9);
}
.lp-accounts-card.is-quiet { background: transparent; }
.lp-accounts-card h2 { margin: 0; font-size: 16px; font-weight: 800; }
.lp-accounts-card p { margin: 0; color: #c2d0d1; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.lp-accounts-card a { color: #83e4ec; }
.lp-accounts-row { display: flex; align-items: center; gap: 12px; }
.lp-accounts-main { display: grid; gap: 4px; min-width: 0; }
.lp-accounts-avatar {
  width: 48px; height: 48px; flex: 0 0 auto; border-radius: 8px; object-fit: cover;
  display: inline-grid; place-items: center; font-weight: 900; color: #041214; background: #c2d0d1;
}
.lp-accounts-avatar.is-faceit { background: #ff5500; color: #fff; }
.lp-accounts-stats { color: #d0aa6c !important; font-weight: 700; }
.lp-accounts-hint { color: #a8b9ba !important; font-size: 13px !important; }
.lp-accounts-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.lp-accounts-actions .lp-accounts-hint { flex: 1 1 100%; }
.lp-accounts-primary, .lp-accounts-secondary, .lp-accounts-danger {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 44px; padding: 0 18px; border-radius: 8px;
  font: inherit; font-weight: 800; text-decoration: none; cursor: pointer;
}
.lp-accounts-primary { border: 0; color: #041214 !important; background: #83e4ec; }
.lp-accounts-secondary { border: 1px solid rgba(196, 224, 225, 0.3); color: #edf7f8 !important; background: transparent; }
.lp-accounts-danger { border: 0; color: #fff; background: #b4413c; }
.lp-accounts-primary:disabled, .lp-accounts-secondary:disabled, .lp-accounts-danger:disabled { opacity: 0.6; cursor: wait; }
.lp-accounts-primary:focus-visible, .lp-accounts-secondary:focus-visible, .lp-accounts-danger:focus-visible,
.lp-accounts-icon-button:focus-visible { outline: 2px solid #83e4ec; outline-offset: 2px; }
.lp-accounts-notice { margin: 0; padding: 12px 14px; border-radius: 8px; font-size: 14px; }
.lp-accounts-notice.is-ok { border: 1px solid rgba(131, 228, 236, 0.4); background: rgba(131, 228, 236, 0.08); }
.lp-accounts-notice.is-error { border: 1px solid rgba(242, 167, 167, 0.4); background: rgba(242, 167, 167, 0.08); }
.lp-accounts-skeleton { display: grid; gap: 12px; }
.lp-accounts-skeleton span { height: 96px; border-radius: 8px; background: rgba(196, 224, 225, 0.06); animation: lp-accounts-pulse 1.2s ease-in-out infinite; }
@keyframes lp-accounts-pulse { 50% { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) { .lp-accounts-skeleton span { animation: none; } }
`;

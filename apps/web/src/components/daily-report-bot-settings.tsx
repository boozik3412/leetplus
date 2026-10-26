"use client";

import { useEffect, useState } from "react";

type BotSettings = {
  bot: {
    connected: boolean;
    status: "PENDING" | "READY" | "INVALID" | null;
    botUsername: string | null;
    tokenHint: string | null;
    lastError: string | null;
    checkedAt: string | null;
  };
  users: Array<{
    userId: string;
    name: string;
    email: string;
    role: string;
    scope: "NETWORK" | "STORES";
    storeCount: number;
    enabled: boolean;
    linked: boolean;
    telegramName: string | null;
    lastDelivery: { reportKey: string; status: string; at: string } | null;
  }>;
};

const ENDPOINT = "/api/settings/daily-report-bot";

async function call<T>(path: string, method: string, body?: unknown) {
  const response = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { message?: unknown })
    | null;
  if (!response.ok || !payload) {
    const message = payload?.message;
    throw new Error(
      typeof message === "string" ? message : "Не удалось сохранить",
    );
  }
  return payload as T;
}

function botStatusText(bot: BotSettings["bot"]) {
  if (!bot.connected) return "Бот не подключён";
  if (bot.status === "READY") return `Подключён @${bot.botUsername ?? "бот"}`;
  if (bot.status === "INVALID") return bot.lastError ?? "Токен не подошёл";
  return "Проверяем токен — это занимает до 5 минут";
}

function recipientText(user: BotSettings["users"][number]) {
  if (!user.enabled) return "Не получает";
  if (!user.linked) return "Ждёт подключения в Telegram";
  const delivery = user.lastDelivery;
  if (!delivery) return `Подключён ${user.telegramName ?? ""}`.trim();
  const [year, month, day] = delivery.reportKey.split("-");
  return delivery.status === "SENT"
    ? `Последний отчёт ${day}.${month}.${year}`
    : `Отчёт ${day}.${month} не доставлен`;
}

export function DailyReportBotSettings() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    call<BotSettings>("", "GET")
      .then(setSettings)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      );
  }, []);

  async function run(action: () => Promise<BotSettings | void>) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setSettings(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const saveToken = () =>
    run(async () => {
      const next = await call<BotSettings>("/token", "POST", { token });
      setToken("");
      setLinks({});
      return next;
    });

  const toggle = (userId: string, enabled: boolean) =>
    run(() =>
      call<BotSettings>(`/recipients/${encodeURIComponent(userId)}`, "PATCH", {
        enabled,
      }),
    );

  const createLink = (userId: string) =>
    run(async () => {
      const { url } = await call<{ url: string }>(
        `/recipients/${encodeURIComponent(userId)}/link`,
        "POST",
      );
      setLinks((current) => ({ ...current, [userId]: url }));
    });

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-semibold">Отчёт за сутки в Telegram</h2>
      <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Каждый день в 10:00 по Москве бот присылает отчёт за прошедшие сутки
        клуба (с 09:00 до 09:00 по местному времени). Если смена ещё не закрыта,
        бот допишет её итог, когда она закроется.
      </p>

      {error ? (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {!settings ? (
        <p className="mt-4 text-sm text-zinc-500">Загружаем…</p>
      ) : (
        <>
          <div className="mt-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm font-medium">1. Бот команды</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {botStatusText(settings.bot)}
              {settings.bot.tokenHint
                ? ` · токен ${settings.bot.tokenHint}`
                : ""}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                autoComplete="off"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                onChange={(event) => setToken(event.target.value)}
                placeholder="Токен от @BotFather, например 1234567890:AA…"
                type="password"
                value={token}
              />
              <button
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={busy || !token.trim()}
                onClick={saveToken}
                type="button"
              >
                {settings.bot.connected ? "Заменить токен" : "Подключить бота"}
              </button>
              {settings.bot.connected ? (
                <button
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
                  disabled={busy}
                  onClick={() =>
                    run(() => call<BotSettings>("/token", "DELETE"))
                  }
                  type="button"
                >
                  Отключить
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm font-medium">2. Кто получает отчёт</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Отметьте людей и отправьте каждому ссылку для подключения: он
              откроет её в Telegram и нажмёт «Старт». Сотрудник с доступом к
              отдельным клубам видит в отчёте только свои клубы.
            </p>
            <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
              {settings.users.map((user) => (
                <li
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center"
                  key={user.userId}
                >
                  <label className="flex flex-1 items-start gap-3">
                    <input
                      checked={user.enabled}
                      className="mt-1 h-4 w-4"
                      disabled={busy}
                      onChange={(event) =>
                        toggle(user.userId, event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        {user.name}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {user.scope === "NETWORK"
                          ? "Вся сеть"
                          : `Клубов: ${user.storeCount}`}{" "}
                        · {recipientText(user)}
                      </span>
                    </span>
                  </label>
                  {user.enabled ? (
                    links[user.userId] ? (
                      <input
                        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs sm:w-80 dark:border-zinc-700 dark:bg-zinc-900"
                        onFocus={(event) => event.target.select()}
                        readOnly
                        value={links[user.userId]}
                      />
                    ) : (
                      <button
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
                        disabled={busy || settings.bot.status !== "READY"}
                        onClick={() => createLink(user.userId)}
                        type="button"
                      >
                        {user.linked
                          ? "Новая ссылка"
                          : "Ссылка для подключения"}
                      </button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

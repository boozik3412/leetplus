"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type AuthMode = "login" | "register";

type AuthFormProps = {
  mode: AuthMode;
};

type FormState = {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
  tenantSlug: string;
};

const initialState: FormState = {
  email: "",
  password: "",
  fullName: "",
  organizationName: "",
  tenantSlug: "",
};

const REMEMBER_EMAIL_KEY = "leetplus_remembered_email";
const LOGIN_AUTO_SYNC_DATE_KEY = "leetplus.login.autoSyncDate";

type LangameSettingsResponse = {
  sources?: Array<{
    isActive: boolean;
    lastSyncedDate: string | null;
  }>;
};

function getErrorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return "Не удалось выполнить запрос";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === "register";

  useEffect(() => {
    if (isRegister) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const rememberedEmail = window.localStorage.getItem(REMEMBER_EMAIL_KEY);

      if (rememberedEmail) {
        setForm((current) => ({ ...current, email: rememberedEmail }));
        setRememberMe(true);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isRegister]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
    const payload = isRegister
      ? {
          email: form.email,
          password: form.password,
          fullName: form.fullName || undefined,
          organizationName: form.organizationName,
          tenantSlug: form.tenantSlug,
        }
      : {
          email: form.email,
          password: form.password,
          rememberMe,
        };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json()) as unknown;
        setError(getErrorMessage(data));
        return;
      }

      if (!isRegister) {
        if (rememberMe) {
          window.localStorage.setItem(REMEMBER_EMAIL_KEY, form.email);
        } else {
          window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }

        void startDailyLoginAutoSync();
      }

      router.push(
        isRegister
          ? `/verify-email?email=${encodeURIComponent(form.email)}`
          : "/dashboard",
      );
      router.refresh();
    } catch {
      setError("Backend недоступен. Проверьте, что API запущен.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isRegister ? (
        <>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              Имя владельца
            </span>
            <input
              name="name"
              autoComplete="name"
              value={form.fullName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  fullName: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="Иван Петров"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              Организация
            </span>
            <input
              name="organization"
              autoComplete="organization"
              value={form.organizationName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  organizationName: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="Cyber Club A"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              Поддомен
            </span>
            <div className="mt-1 flex rounded-md border border-zinc-300 bg-white focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-200">
              <input
                name="tenantSlug"
                autoComplete="off"
                value={form.tenantSlug}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tenantSlug: event.target.value,
                  }))
                }
                className="min-w-0 flex-1 rounded-l-md px-3 py-2 text-sm outline-none"
                placeholder="club-a"
                required
              />
              <span className="rounded-r-md border-l border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
                .leetplus.ru
              </span>
            </div>
          </label>
        </>
      ) : null}

      <label className="block">
        <span className="text-sm font-medium text-zinc-700">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) =>
            setForm((current) => ({ ...current, email: event.target.value }))
          }
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="owner@club-a.leetplus.ru"
          required
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-zinc-700">Пароль</span>
        <input
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          value={form.password}
          onChange={(event) =>
            setForm((current) => ({ ...current, password: event.target.value }))
          }
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Минимум 8 символов"
          required
        />
      </label>

      {!isRegister ? (
        <label className="flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300"
          />
          <span>
            <span className="block font-medium text-zinc-900">
              Запомнить меня
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Email сохранится в этом браузере, а сессия будет действовать
              дольше. Пароль сохраняет менеджер паролей браузера.
            </span>
          </span>
        </label>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isSubmitting
          ? "Отправка..."
          : isRegister
            ? "Создать организацию"
            : "Войти"}
      </button>

      <p className="text-center text-sm text-zinc-500">
        {isRegister ? "Уже есть аккаунт?" : "Еще нет аккаунта?"}{" "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-medium text-zinc-900 underline-offset-4 hover:underline"
        >
          {isRegister ? "Войти" : "Зарегистрироваться"}
        </Link>
      </p>
    </form>
  );
}

async function startDailyLoginAutoSync() {
  const todayKey = new Date().toISOString().slice(0, 10);

  if (window.localStorage.getItem(LOGIN_AUTO_SYNC_DATE_KEY) === todayKey) {
    return;
  }

  try {
    const settingsResponse = await fetch("/api/integrations/langame/settings", {
      cache: "no-store",
    });

    if (!settingsResponse.ok) {
      return;
    }

    const settings = (await settingsResponse.json()) as LangameSettingsResponse;
    const activeSources = (settings.sources ?? []).filter(
      (source) => source.isActive,
    );
    const shouldSync = activeSources.some(
      (source) => source.lastSyncedDate?.slice(0, 10) !== todayKey,
    );

    if (!shouldSync) {
      window.localStorage.setItem(LOGIN_AUTO_SYNC_DATE_KEY, todayKey);
      return;
    }

    window.localStorage.setItem(LOGIN_AUTO_SYNC_DATE_KEY, todayKey);

    const results = await Promise.allSettled([
      fetch("/api/integrations/langame/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "BACKFILL",
          catchUp: true,
        }),
      }),
      fetch("/api/integrations/langame/guests/foundation/sync/start", {
        method: "POST",
      }),
    ]);

    if (
      !results.some(
        (result) => result.status === "fulfilled" && result.value.ok,
      )
    ) {
      window.localStorage.removeItem(LOGIN_AUTO_SYNC_DATE_KEY);
    }
  } catch {
    window.localStorage.removeItem(LOGIN_AUTO_SYNC_DATE_KEY);
    // Login must stay fast and reliable even when background sync is unavailable.
  }
}

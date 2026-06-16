"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import type { AuthUser } from "@/lib/auth";
import { getDefaultLandingPath } from "@/lib/landing";
import { getRoleLabel, type UserRole } from "@/lib/roles";

type AuthMode = "login" | "register";

type AuthFormProps = {
  mode: AuthMode;
  inviteToken?: string | null;
  returnTo?: string | null;
};

type FormState = {
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  organizationName: string;
  tenantSlug: string;
};

const initialState: FormState = {
  email: "",
  password: "",
  confirmPassword: "",
  fullName: "",
  organizationName: "",
  tenantSlug: "",
};

const REMEMBER_EMAIL_KEY = "leetplus_remembered_email";

type InvitePreview = {
  email: string | null;
  fullName: string | null;
  role: UserRole;
  customRole: {
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
  } | null;
  tenant: {
    name: string;
    slug: string;
  };
  scope: "NETWORK" | "STORES";
  stores: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
  expiresAt: string;
};

function localizeAuthError(message: string) {
  const normalized = message.trim().toLowerCase();

  if (
    normalized === "invite is already used" ||
    normalized === "invate is already used"
  ) {
    return "Ссылка-приглашение уже использована.";
  }

  if (normalized === "invite is expired") {
    return "Срок действия приглашения истек.";
  }

  if (normalized === "invite was not found") {
    return "Ссылка-приглашение не найдена.";
  }

  if (normalized === "invalid email or password") {
    return "Неверный email или пароль.";
  }

  if (normalized === "password must contain at least 8 characters") {
    return "Пароль должен содержать минимум 8 символов.";
  }

  if (normalized === "valid email is required") {
    return "Укажите корректный email.";
  }

  if (normalized === "user account is inactive") {
    return "Учетная запись отключена.";
  }

  if (normalized === "user no longer exists") {
    return "Учетная запись больше не существует.";
  }

  if (normalized === "tenant is not active") {
    return "Организация не активна.";
  }

  if (normalized === "user with this email already exists") {
    return "Пользователь с таким email уже существует.";
  }

  if (normalized === "organization name is required") {
    return "Укажите название организации.";
  }

  if (normalized === "tenant slug is already taken") {
    return "Такой адрес организации уже занят.";
  }

  if (normalized === "invite is issued for another email") {
    return "Приглашение выдано на другой email.";
  }

  if (
    normalized ===
    "tenant slug must be 3-32 lowercase letters, numbers or hyphens"
  ) {
    return "Адрес организации должен содержать 3-32 символа: строчные латинские буквы, цифры или дефисы.";
  }

  if (normalized === "passwords do not match") {
    return "Пароли не совпадают.";
  }

  return message;
}

function getErrorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return localizeAuthError(data.message);
  }

  return "Не удалось выполнить запрос";
}

export function AuthForm({ mode, inviteToken, returnTo }: AuthFormProps) {
  const router = useRouter();
  const isRegister = mode === "register";
  const isInviteRegister = isRegister && Boolean(inviteToken);
  const [form, setForm] = useState<FormState>(initialState);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviteLoading, setIsInviteLoading] = useState(isInviteRegister);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const passwordMismatch =
    isRegister &&
    form.password.length > 0 &&
    form.confirmPassword.length > 0 &&
    form.password !== form.confirmPassword;

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

  useEffect(() => {
    if (!isInviteRegister || !inviteToken) {
      return;
    }

    let isCancelled = false;

    fetch(`/api/auth/invites/${encodeURIComponent(inviteToken)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = (await response.json()) as unknown;
          throw new Error(getErrorMessage(data));
        }

        return response.json() as Promise<InvitePreview>;
      })
      .then((loadedInvite) => {
        if (isCancelled) {
          return;
        }

        setInvite(loadedInvite);
        setForm((current) => ({
          ...current,
          email: loadedInvite.email ?? current.email,
          fullName: loadedInvite.fullName ?? current.fullName,
        }));
      })
      .catch((fetchError: unknown) => {
        if (isCancelled) {
          return;
        }

        setInviteError(
          fetchError instanceof Error
            ? fetchError.message
            : "Не удалось открыть приглашение",
        );
      })
      .finally(() => {
        if (!isCancelled) {
          setIsInviteLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [inviteToken, isInviteRegister]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (isRegister && form.password !== form.confirmPassword) {
      setError("Пароли не совпадают. Проверьте повтор пароля.");
      return;
    }

    setIsSubmitting(true);
    let keepLoading = false;

    const endpoint = isInviteRegister
      ? `/api/auth/invites/${encodeURIComponent(inviteToken ?? "")}/accept`
      : isRegister
        ? "/api/auth/register"
        : "/api/auth/login";
    const payload = isInviteRegister
      ? {
          email: form.email,
          password: form.password,
          confirmPassword: form.confirmPassword,
          fullName: form.fullName || undefined,
        }
      : isRegister
      ? {
          email: form.email,
          password: form.password,
          confirmPassword: form.confirmPassword,
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

      const data = (await response.json()) as { user?: AuthUser };
      const landingPath = data.user ? getDefaultLandingPath(data.user) : "/dashboard";

      if (!isRegister) {
        if (rememberMe) {
          window.localStorage.setItem(REMEMBER_EMAIL_KEY, form.email);
        } else {
          window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }
      }

      keepLoading = true;
      setIsRedirecting(true);
      router.replace(
        isInviteRegister
          ? landingPath
          : isRegister
          ? `/verify-email?email=${encodeURIComponent(form.email)}`
          : returnTo ?? landingPath,
      );
    } catch {
      setError("Backend недоступен. Проверьте, что API запущен.");
    } finally {
      if (!keepLoading) {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <>
      {isRedirecting ? (
        <AuthRedirectOverlay
          isRegister={isRegister}
          isInviteRegister={isInviteRegister}
        />
      ) : null}
      <form onSubmit={handleSubmit} className="space-y-4">
      {isInviteRegister ? (
        <div
          className={[
            "rounded-md border px-3 py-3 text-sm",
            inviteError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-950",
          ].join(" ")}
        >
          {isInviteLoading ? (
            <p>Проверяем ссылку приглашения...</p>
          ) : inviteError ? (
            <p>{inviteError}</p>
          ) : invite ? (
            <>
              <p className="font-semibold">
                Приглашение в {invite.tenant.name}
              </p>
              <p className="mt-1 text-emerald-800">
                Роль: {invite.customRole?.name ?? getRoleLabel(invite.role)}
              </p>
              <p className="mt-1 text-emerald-800">
                Доступ:{" "}
                {invite.scope === "NETWORK"
                  ? "вся сеть"
                  : invite.stores.map((store) => store.name).join(", ")}
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {isRegister ? (
        <>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">
              {isInviteRegister ? "Имя сотрудника" : "Имя владельца"}
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

          {!isInviteRegister ? (
            <>
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
        </>
      ) : null}

      <label className="block">
        <span className="text-sm font-medium text-zinc-700">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          readOnly={Boolean(isInviteRegister && invite?.email)}
          onChange={(event) =>
            setForm((current) => ({ ...current, email: event.target.value }))
          }
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 read-only:bg-zinc-50 read-only:text-zinc-500"
          placeholder={
            isInviteRegister ? "employee@club.ru" : "owner@club-a.leetplus.ru"
          }
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

      {isRegister ? (
        <label className="block">
          <span className="text-sm font-medium text-zinc-700">
            Повторите пароль
          </span>
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            aria-invalid={passwordMismatch ? true : undefined}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                confirmPassword: event.target.value,
              }))
            }
            className={[
              "mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2",
              passwordMismatch
                ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                : "border-zinc-300 focus:border-zinc-500 focus:ring-zinc-200",
            ].join(" ")}
            placeholder="Введите пароль еще раз"
            required
          />
          {passwordMismatch ? (
            <p className="mt-1 text-xs font-medium text-red-600">
              Пароли не совпадают.
            </p>
          ) : null}
        </label>
      ) : null}

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
          disabled={
            isSubmitting ||
            isRedirecting ||
            (isInviteRegister && (isInviteLoading || Boolean(inviteError)))
          }
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isRedirecting
            ? isInviteRegister
              ? "Открываем рабочий кабинет..."
              : isRegister
              ? "Открываем подтверждение..."
              : "Загружаем дашборд..."
            : isSubmitting
              ? "Отправка..."
              : isInviteRegister
                ? "Завершить регистрацию"
                : isRegister
                ? "Создать организацию"
                : "Войти"}
        </button>

      <p className="text-center text-sm text-zinc-500">
        {isRegister ? "Уже есть аккаунт?" : "Еще нет аккаунта?"}{" "}
        <a
          href={isRegister ? "/login" : "/register"}
          className="font-medium text-zinc-900 underline-offset-4 hover:underline"
        >
          {isRegister ? "Войти" : "Зарегистрироваться"}
        </a>
      </p>
      </form>
    </>
  );
}

function AuthRedirectOverlay({
  isRegister,
  isInviteRegister,
}: {
  isRegister: boolean;
  isInviteRegister: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 px-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-950 px-6 py-6 text-center text-zinc-100 shadow-xl">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-900 border-t-emerald-400" />
        <p className="mt-4 text-base font-semibold">
          {isInviteRegister
            ? "Регистрация завершена"
            : isRegister
              ? "Открываем подтверждение"
              : "Вход выполнен"}
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          {isInviteRegister
            ? "Готовим рабочий кабинет с уже настроенной ролью и доступами."
            : isRegister
            ? "Подготавливаем страницу подтверждения email."
            : "Загружаем LeetPlus и актуальные данные дашборда."}
        </p>
      </div>
    </div>
  );
}

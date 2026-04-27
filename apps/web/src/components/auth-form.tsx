"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === "register";

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

      router.push("/dashboard");
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
          type="email"
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
          type="password"
          value={form.password}
          onChange={(event) =>
            setForm((current) => ({ ...current, password: event.target.value }))
          }
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          placeholder="Минимум 8 символов"
          required
        />
      </label>

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

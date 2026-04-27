"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Status = "idle" | "confirming" | "confirmed" | "resending" | "sent" | "error";

type ErrorResponse = {
  message?: string;
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

export function VerifyEmailPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const initialEmail = useMemo(
    () => searchParams.get("email") ?? "",
    [searchParams],
  );
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<Status>(token ? "confirming" : "idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;

    async function confirmEmail() {
      setStatus("confirming");
      setError(null);

      const response = await fetch("/api/auth/confirm-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      if (!isMounted) {
        return;
      }

      if (!response.ok) {
        const data = (await response.json()) as ErrorResponse;
        setError(getErrorMessage(data));
        setStatus("error");
        return;
      }

      setStatus("confirmed");
      router.refresh();
    }

    void confirmEmail();

    return () => {
      isMounted = false;
    };
  }, [router, token]);

  async function handleResend() {
    setStatus("resending");
    setError(null);

    const response = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const data = (await response.json()) as ErrorResponse;
      setError(getErrorMessage(data));
      setStatus("error");
      return;
    }

    setStatus("sent");
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">Email</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Подтверждение регистрации
      </h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Мы отправляем письмо со ссылкой подтверждения. В локальной разработке оно
        попадет в Mailpit.
      </p>

      <div className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        {status === "confirming"
          ? "Проверяем ссылку подтверждения..."
          : status === "confirmed"
            ? "Email подтвержден. Можно продолжать работу."
            : status === "sent"
              ? "Письмо отправлено повторно."
              : "Проверьте почту и перейдите по ссылке из письма."}
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!token ? (
        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              placeholder="owner@club-a.leetplus.ru"
            />
          </label>

          <button
            type="button"
            onClick={handleResend}
            disabled={status === "resending" || !email.trim()}
            className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {status === "resending" ? "Отправка..." : "Отправить повторно"}
          </button>
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link
          href="/dashboard"
          className="font-medium text-zinc-900 underline-offset-4 hover:underline"
        >
          Перейти в приложение
        </Link>
        <span className="text-zinc-500">Mailpit: localhost:8025</span>
      </div>
    </section>
  );
}

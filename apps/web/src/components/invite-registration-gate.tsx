"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AuthForm } from "@/components/auth-form";
import type { AuthUser } from "@/lib/auth";
import { readInviteTokenFromFragment } from "@/lib/invite-secret.mts";
import { getDefaultLandingPath } from "@/lib/landing";

type GateStatus =
  | "CAPTURING"
  | "CHECKING_SESSION"
  | "READY"
  | "REDIRECTING"
  | "INVALID"
  | "FAILED";

export function InviteRegistrationGate() {
  const router = useRouter();
  const capturedTokenRef = useRef<string | null | undefined>(undefined);
  const scrubFailedRef = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<GateStatus>("CAPTURING");

  useLayoutEffect(() => {
    if (capturedTokenRef.current === undefined) {
      capturedTokenRef.current = readInviteTokenFromFragment(
        window.location.hash,
      );
      try {
        window.history.replaceState(window.history.state, "", "/register");
      } catch {
        capturedTokenRef.current = null;
        scrubFailedRef.current = true;
      }
    }

    const capturedToken = capturedTokenRef.current;
    const nextStatus: GateStatus = scrubFailedRef.current
      ? "FAILED"
      : capturedToken
        ? "CHECKING_SESSION"
        : "INVALID";

    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      setToken(nextStatus === "CHECKING_SESSION" ? capturedToken : null);
      setStatus(nextStatus);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "CHECKING_SESSION" || !token) {
      return;
    }

    let cancelled = false;
    fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
      referrerPolicy: "no-referrer",
    })
      .then(async (response) => {
        if (cancelled) {
          return;
        }

        if (response.status === 401) {
          setStatus("READY");
          return;
        }
        if (!response.ok) {
          setStatus("FAILED");
          return;
        }

        const body = (await response.json()) as { user?: AuthUser };
        if (!body.user) {
          setStatus("FAILED");
          return;
        }

        capturedTokenRef.current = null;
        setToken(null);
        setStatus("REDIRECTING");
        router.replace(getDefaultLandingPath(body.user));
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("FAILED");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router, status, token]);

  if (status === "READY" && token) {
    return (
      <AuthForm
        mode="register"
        inviteToken={token}
        onInviteAccepted={() => {
          capturedTokenRef.current = null;
          setToken(null);
          setStatus("REDIRECTING");
        }}
      />
    );
  }

  if (status === "INVALID") {
    return (
      <InviteGateMessage>
        <p>
          В этой ссылке нет действующего приглашения. Откройте исходную ссылку
          ещё раз или попросите администратора перевыпустить приглашение.
        </p>
      </InviteGateMessage>
    );
  }

  if (status === "FAILED") {
    return (
      <InviteGateMessage>
        <p>
          Не удалось безопасно открыть приглашение. Обновите страницу через
          исходную ссылку или обратитесь к администратору.
        </p>
      </InviteGateMessage>
    );
  }

  return (
    <div
      className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700"
      aria-live="polite"
    >
      {status === "REDIRECTING"
        ? "Открываем текущий рабочий кабинет..."
        : "Безопасно открываем приглашение..."}
    </div>
  );
}

function InviteGateMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div
        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950"
        role="alert"
      >
        {children}
      </div>
      <Link
        href="/login"
        className="inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
      >
        Вернуться ко входу
      </Link>
    </div>
  );
}

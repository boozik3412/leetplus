"use client";

import { useEffect, useRef, useState } from "react";
import { formatUserCallRemaining, getUserCallFeedback, type UserCallStatus } from "@/lib/user-call-feedback";

type Props = {
  callHref: string;
  callNumber: string;
  phoneMasked: string;
  freeCall: boolean;
  expiresAt: string;
  status: UserCallStatus;
  statusMessage?: string;
  pollError: string | null;
  isStarting: boolean;
  canRetry: boolean;
  onClose: () => void;
  onRetry: () => void;
  onUseTelegram?: () => void;
};

export function UserCallInstructionModal({
  callHref, callNumber, phoneMasked, freeCall, expiresAt, status,
  statusMessage, pollError, isStarting, canRetry, onClose, onRetry, onUseTelegram,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const feedback = getUserCallFeedback({ status, expiresAt, now, pollError, statusMessage });
  const callAvailable = feedback.canCall && !isStarting;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const refresh = () => setNow(Date.now());
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="user-call-auth-title"
      aria-describedby="user-call-auth-description"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex="0"]',
        )).filter((element) => element.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[560px] overflow-y-auto overscroll-contain rounded-xl border border-cyan-300/20 bg-[#050c0e] p-5 text-white shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-sm sm:p-7"
    >
      <div>
        <button
          aria-label="Закрыть окно"
          className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-lg border border-white/20 text-xl text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
          onClick={onClose}
          type="button"
        >×</button>
        <p className="pr-12 text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Вход по звонку</p>
        <h2 id="user-call-auth-title" className="mt-3 pr-10 text-2xl font-black leading-tight sm:text-3xl">
          {callAvailable ? "Подтвердите номер звонком" : isStarting ? "Начинаем новую попытку" : feedback.title}
        </h2>
        <p id="user-call-auth-description" className="mt-4 text-sm leading-6 text-slate-200">
          {callAvailable
            ? `Позвоните ${freeCall ? "на бесплатный номер ниже" : "на номер ниже"} с телефона ${phoneMasked}. После подтверждения звонок завершится, а вход продолжится автоматически. Вводить код не нужно.`
            : `Не звоните по номеру из предыдущей попытки. Начните новую проверку${onUseTelegram ? " или войдите через Telegram" : ""}.`}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2">
          <span className="text-sm text-slate-200">Ваш телефон <strong className="text-white">{phoneMasked}</strong></span>
          <span role="timer" aria-live="off" className="text-sm font-semibold tabular-nums text-cyan-100">
            {feedback.remainingSeconds === null ? "Срок неизвестен" : feedback.remainingSeconds > 0 && status === "PENDING"
              ? `Осталось ${formatUserCallRemaining(feedback.remainingSeconds)}` : "Срок ожидания завершён"}
          </span>
        </div>

        {callAvailable ? (
          <div className="mt-5">
            <p className="text-sm text-slate-300">Номер для звонка</p>
            <p className="mt-2 break-words text-center text-[clamp(27px,7vw,44px)] font-black leading-tight tracking-tight text-cyan-300">{callNumber}</p>
            <a href={callHref} className="mt-4 flex min-h-11 items-center justify-center rounded-lg bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:hidden">Позвонить сейчас</a>
          </div>
        ) : null}

        <div role="status" aria-live="polite" aria-atomic="true" className={`mt-5 rounded-lg border px-3 py-3 text-sm leading-6 ${feedback.tone === "pending" ? "border-cyan-300/25 bg-cyan-300/5 text-cyan-100" : "border-amber-300/30 bg-amber-300/10 text-amber-100"}`}>
          <p className="font-bold">{isStarting ? "Запрашиваем новую проверку" : feedback.title}</p>
          <p className="mt-1">{isStarting ? "Дождитесь ответа перед звонком. Номер может совпасть с предыдущим." : feedback.message}</p>
          {status === "FAILED" && pollError && !isStarting ? <p className="mt-2">Не удалось начать или завершить проверку. Повторите запрос или выберите другой способ входа.</p> : null}
        </div>

        {callAvailable ? <p className="mt-4 text-sm leading-6 text-slate-300">Номер занят или недоступен? Это ещё не подтверждение входа. Проверьте, с какой SIM-карты звоните{onUseTelegram ? ", или выберите Telegram" : ""}.</p> : null}

        <div className="mt-5 grid gap-3">
          {onUseTelegram ? <button type="button" onClick={onUseTelegram} className="min-h-11 rounded-lg bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Войти через Telegram</button> : null}
          {!feedback.canCall && status !== "CONFIRMED" ? <button type="button" onClick={onRetry} disabled={!canRetry || isStarting} className="min-h-11 rounded-lg border border-cyan-200/60 px-4 py-3 text-sm font-bold text-cyan-100 hover:bg-cyan-300/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-60">{isStarting ? "Запрашиваем…" : "Начать новую попытку"}</button> : null}
        </div>
      </div>
    </dialog>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { GuestPortalGameSummary } from "@/lib/guest-portal";
import styles from "./guest-bug-report.module.css";

type BugReportResponse = {
  ticketNumber: string;
  createdAt: string;
};

export function GuestBugReportButton({
  configuration,
}: {
  configuration: GuestPortalGameSummary["support"]["bugReporting"];
}) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BugReportResponse | null>(null);
  const idempotencyKeyRef = useRef("");
  const topicRef = useRef<HTMLSelectElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const removeFile = useCallback(() => {
    setFile(null);
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const closeDialog = useCallback(() => {
    if (submitting) {
      return;
    }
    setOpen(false);
    setTopic("");
    setDescription("");
    removeFile();
    setError(null);
    setResult(null);
  }, [removeFile, submitting]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      topicRef.current?.focus();
    });
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        closeDialog();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog, open, submitting]);

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl],
  );

  function openDialog() {
    idempotencyKeyRef.current = createIdempotencyKey();
    setError(null);
    setResult(null);
    setOpen(true);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setError(null);
    if (!nextFile) {
      removeFile();
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(nextFile.type)) {
      removeFile();
      setError("Можно приложить только JPG, PNG или WebP.");
      return;
    }
    if (nextFile.size > configuration.maxAttachmentBytes) {
      removeFile();
      setError("Размер изображения не должен превышать 5 МБ.");
      return;
    }
    setFile(nextFile);
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(nextFile);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const normalizedDescription = description.trim();
    if (!topic) {
      setError("Выберите тему обращения.");
      topicRef.current?.focus();
      return;
    }
    if (
      normalizedDescription.length < 30 ||
      normalizedDescription.length > 2000
    ) {
      setError("Описание должно содержать от 30 до 2000 символов.");
      return;
    }

    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("topic", topic);
      body.set("description", normalizedDescription);
      body.set("route", `${window.location.pathname}${window.location.hash}`);
      body.set("viewport", `${window.innerWidth}x${window.innerHeight}`);
      body.set(
        "timeZone",
        Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
      );
      if (file) {
        body.set("file", file, file.name);
      }

      const response = await fetch("/api/guest-support/bug-report", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKeyRef.current },
        body,
      });
      const payload = (await response.json().catch(() => null)) as
        | (Partial<BugReportResponse> & { message?: string })
        | null;
      if (!response.ok) {
        throw new Error(payload?.message || "Не удалось отправить обращение.");
      }
      if (
        typeof payload?.ticketNumber !== "string" ||
        typeof payload.createdAt !== "string"
      ) {
        throw new Error("Сервис обращений вернул некорректный ответ.");
      }
      setResult({
        ticketNumber: payload.ticketNumber,
        createdAt: payload.createdAt,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось отправить обращение.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      closeDialog();
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Сообщить о проблеме"
        title="Сообщить о проблеме"
        onClick={openDialog}
      >
        <BugIcon />
      </button>

      {open
        ? createPortal(
            <div className={styles.backdrop} onMouseDown={handleBackdropClick}>
              <section
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="guestBugReportTitle"
              >
                <button
                  type="button"
                  className={styles.close}
                  aria-label="Закрыть форму"
                  disabled={submitting}
                  onClick={closeDialog}
                >
                  ×
                </button>

                {result ? (
                  <div className={styles.success} aria-live="polite">
                    <span className={styles.successIcon}>✓</span>
                    <p className={styles.eyebrow}>Сообщение отправлено</p>
                    <h2 id="guestBugReportTitle">Спасибо, мы всё получили</h2>
                    <p>Номер обращения</p>
                    <strong>{result.ticketNumber}</strong>
                    <button type="button" onClick={closeDialog}>
                      Понятно
                    </button>
                  </div>
                ) : (
                  <form className={styles.form} onSubmit={handleSubmit}>
                    <p className={styles.eyebrow}>Техническая поддержка</p>
                    <h2 id="guestBugReportTitle">Сообщить о проблеме</h2>
                    <p className={styles.intro}>
                      Опишите, что произошло. Мы автоматически приложим данные о
                      странице и устройстве.
                    </p>

                    <label className={styles.field}>
                      <span>Тема инцидента</span>
                      <select
                        ref={topicRef}
                        value={topic}
                        required
                        onChange={(event) => setTopic(event.target.value)}
                      >
                        <option value="">Выберите тему</option>
                        {configuration.topics.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Описание</span>
                      <textarea
                        value={description}
                        minLength={30}
                        maxLength={2000}
                        required
                        placeholder="Что вы делали, что ожидали увидеть и что произошло?"
                        onChange={(event) => setDescription(event.target.value)}
                      />
                      <small>{description.length} / 2000</small>
                    </label>

                    <div className={styles.field}>
                      <span>Скриншот, если есть</span>
                      <label className={styles.upload}>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileChange}
                        />
                        <span>
                          {file ? "Заменить изображение" : "Выбрать файл"}
                        </span>
                        <small>
                          JPG, PNG или WebP · до{" "}
                          {formatBytes(configuration.maxAttachmentBytes)}
                        </small>
                      </label>
                    </div>

                    {previewUrl && file ? (
                      <div className={styles.preview}>
                        {/* Blob URLs are local previews and cannot use next/image. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewUrl} alt="Предпросмотр скриншота" />
                        <div>
                          <span>{file.name}</span>
                          <small>{formatBytes(file.size)}</small>
                        </div>
                        <button type="button" onClick={removeFile}>
                          Удалить
                        </button>
                      </div>
                    ) : null}

                    {error ? (
                      <p className={styles.error} role="alert">
                        {error}
                      </p>
                    ) : null}

                    <button
                      type="submit"
                      className={styles.submit}
                      disabled={submitting}
                    >
                      {submitting ? "Отправляем…" : "Отправить сообщение"}
                    </button>
                  </form>
                )}
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function BugIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4.5 7.7 2.8M15 4.5l1.3-1.7M8 9H4.5M19.5 9H16M8 14H4.5M19.5 14H16M9 19.5l-1.8 1.7M15 19.5l1.8 1.7" />
      <path d="M8 8.5a4 4 0 0 1 8 0v6.3a4 4 0 0 1-8 0V8.5Z" />
      <path d="M8 11.5h8M12 7v10" />
    </svg>
  );
}

function createIdempotencyKey() {
  if (typeof crypto.randomUUID === "function") {
    return `bug:${crypto.randomUUID()}`;
  }
  return `bug:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

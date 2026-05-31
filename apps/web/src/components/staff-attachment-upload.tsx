"use client";

import { useRef, useState, type ChangeEvent } from "react";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export type StaffAttachmentUploadResult = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  url: string;
  createdAt: string;
};

type StaffAttachmentUploadProps = {
  label?: string;
  buttonLabel?: string;
  className?: string;
  onUploaded: (attachment: StaffAttachmentUploadResult) => void;
};

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} Б`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} КБ`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

async function readUploadError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? "Не удалось загрузить файл";
  } catch {
    return "Не удалось загрузить файл";
  }
}

export function StaffAttachmentUpload({
  label = "Файл",
  buttonLabel = "Загрузить",
  className = "",
  onUploaded,
}: StaffAttachmentUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setMessage("Файл должен быть не больше 5 МБ");
      event.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    setIsUploading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/staff/attachments", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readUploadError(response));
      }

      const attachment =
        (await response.json()) as StaffAttachmentUploadResult;
      onUploaded(attachment);
      setMessage(`${attachment.fileName} · ${formatBytes(attachment.byteSize)}`);
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Не удалось загрузить файл",
      );
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        className="h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
        title={label}
      >
        {isUploading ? "Загрузка..." : buttonLabel}
      </button>
      {message ? (
        <p className="mt-1 max-w-72 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}

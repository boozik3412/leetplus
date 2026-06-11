"use client";

import { useRef, useState, type ChangeEvent } from "react";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const DEFAULT_IMAGE_MAX_SIDE = 1800;
const DEFAULT_IMAGE_QUALITY = 0.82;

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
  multiple?: boolean;
  accept?: string;
  compressImages?: boolean;
  maxImageSide?: number;
  imageQuality?: number;
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

function renameImageFile(file: File, extension: string) {
  const normalizedExtension = extension.startsWith(".")
    ? extension
    : `.${extension}`;
  const withoutExtension = file.name.replace(/\.[^.]+$/, "");

  return `${withoutExtension || "photo"}${normalizedExtension}`;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function prepareImageUploadFile(
  file: File,
  maxImageSide: number,
  imageQuality: number,
) {
  if (!file.type.startsWith("image/") || typeof window === "undefined") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxImageSide / Math.max(bitmap.width, bitmap.height));

    if (scale >= 1 && file.size <= MAX_ATTACHMENT_BYTES) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await canvasToBlob(canvas, "image/jpeg", imageQuality);
    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File([blob], renameImageFile(file, "jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

async function prepareUploadFile(
  file: File,
  compressImages: boolean,
  maxImageSide: number,
  imageQuality: number,
) {
  if (!compressImages) {
    return file;
  }

  return prepareImageUploadFile(file, maxImageSide, imageQuality);
}

async function uploadFile(file: File) {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch("/api/staff/attachments", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readUploadError(response));
  }

  return (await response.json()) as StaffAttachmentUploadResult;
}

export function StaffAttachmentUpload({
  label = "Файл",
  buttonLabel = "Загрузить",
  className = "",
  multiple = false,
  accept,
  compressImages = false,
  maxImageSide = DEFAULT_IMAGE_MAX_SIDE,
  imageQuality = DEFAULT_IMAGE_QUALITY,
  onUploaded,
}: StaffAttachmentUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    setIsUploading(true);
    setMessage(null);

    let uploadedCount = 0;

    try {
      for (const sourceFile of files) {
        const file = await prepareUploadFile(
          sourceFile,
          compressImages,
          maxImageSide,
          imageQuality,
        );

        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(
            `${sourceFile.name}: файл должен быть не больше 5 МБ после сжатия`,
          );
        }

        const attachment = await uploadFile(file);
        onUploaded(attachment);
        uploadedCount += 1;
      }

      const suffix =
        uploadedCount === 1
          ? `${files[0]?.name ?? "файл"} · ${formatBytes(files[0]?.size ?? 0)}`
          : `Загружено файлов: ${uploadedCount}`;
      setMessage(suffix);
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
        multiple={multiple}
        accept={accept}
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

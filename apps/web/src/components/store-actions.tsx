"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Store } from "@/lib/stores";

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

  return "Не удалось сохранить торговую точку";
}

export function StoreCreateForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = event.currentTarget;
    const response = await submitStoreForm("/api/stores", "POST", form);

    setIsSubmitting(false);

    if (!response.ok) {
      const data = (await response.json()) as ErrorResponse;
      setError(getErrorMessage(data));
      return;
    }

    form.reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-base font-semibold">Новая торговая точка</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StoreInputs />
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isSubmitting ? "Сохранение..." : "Добавить"}
      </button>
    </form>
  );
}

export function StoreEditForm({ store }: { store: Store }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await submitStoreForm(
      `/api/stores/${store.id}`,
      "PATCH",
      event.currentTarget,
    );

    setIsSubmitting(false);

    if (!response.ok) {
      const data = (await response.json()) as ErrorResponse;
      setError(getErrorMessage(data));
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid min-w-[420px] gap-2">
      <div className="grid gap-2 md:grid-cols-3">
        <StoreInputs store={store} />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
        >
          {isSubmitting ? "..." : "OK"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </form>
  );
}

export function StoreArchiveButton({ id }: { id: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleClick() {
    setIsSubmitting(true);
    const response = await fetch(`/api/stores/${id}`, {
      method: "DELETE",
    });
    setIsSubmitting(false);

    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSubmitting}
      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
    >
      {isSubmitting ? "..." : "В архив"}
    </button>
  );
}

function StoreInputs({ store }: { store?: Store }) {
  return (
    <>
      <input
        name="name"
        defaultValue={store?.name}
        required
        placeholder="Название клуба"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
      />
      <input
        name="address"
        defaultValue={store?.address ?? ""}
        placeholder="Адрес"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
      />
      <input
        name="publicSlug"
        defaultValue={store?.publicSlug ?? ""}
        placeholder="Публичный slug"
        pattern="[a-z0-9-]+"
        title="Только латинские буквы, цифры и дефисы"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
      />
    </>
  );
}

async function submitStoreForm(
  url: string,
  method: "POST" | "PATCH",
  form: HTMLFormElement,
) {
  const formData = new FormData(form);

  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: String(formData.get("name") ?? "").trim(),
      address: optionalString(formData.get("address")) ?? null,
      publicSlug: optionalString(formData.get("publicSlug")) ?? null,
    }),
  });
}

function optionalString(value: FormDataEntryValue | null) {
  const stringValue = String(value ?? "").trim();
  return stringValue || undefined;
}

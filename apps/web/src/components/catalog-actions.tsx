"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type CatalogKind = "categories" | "suppliers";

type CategoryFormProps = {
  kind: "categories";
};

type SupplierFormProps = {
  kind: "suppliers";
};

type CatalogFormProps = CategoryFormProps | SupplierFormProps;

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

  return "Не удалось сохранить данные";
}

export function CatalogCreateForm({ kind }: CatalogFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "");
    const payload =
      kind === "categories"
        ? { name }
        : {
            name,
            paymentDelayDays: parseOptionalNumber(formData.get("paymentDelayDays")),
            minOrderAmount: optionalString(formData.get("minOrderAmount")),
            orderMultiplicity: parseOptionalNumber(
              formData.get("orderMultiplicity"),
            ),
          };

    try {
      const response = await fetch(`/api/${kind}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json()) as ErrorResponse;
        setError(getErrorMessage(data));
        return;
      }

      event.currentTarget.reset();
      router.refresh();
    } catch {
      setError("API недоступен");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-base font-semibold">
        {kind === "categories" ? "Новая категория" : "Новый поставщик"}
      </h2>
      <div className="mt-4 grid gap-3">
        <input
          name="name"
          required
          placeholder={kind === "categories" ? "Название категории" : "Название поставщика"}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />

        {kind === "suppliers" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              name="paymentDelayDays"
              type="number"
              min="0"
              placeholder="Отсрочка, дней"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
            <input
              name="minOrderAmount"
              type="number"
              min="0"
              step="0.01"
              placeholder="Мин. заказ"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
            <input
              name="orderMultiplicity"
              type="number"
              min="0"
              placeholder="Кратность"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>
        ) : null}
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

export function CatalogRenameForm({
  id,
  name,
  kind,
}: {
  id: string;
  name: string;
  kind: CatalogKind;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    const response = await fetch(`/api/${kind}/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: value }),
    });

    setIsSubmitting(false);

    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-[240px] gap-2">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
      />
      <button
        type="submit"
        disabled={isSubmitting || value.trim() === name}
        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
      >
        OK
      </button>
    </form>
  );
}

export function CatalogDeleteButton({
  id,
  kind,
  label = "Удалить",
}: {
  id: string;
  kind: CatalogKind;
  label?: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleClick() {
    setIsSubmitting(true);
    const response = await fetch(`/api/${kind}/${id}`, {
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
      {isSubmitting ? "..." : label}
    </button>
  );
}

function optionalString(value: FormDataEntryValue | null) {
  const stringValue = String(value ?? "").trim();
  return stringValue || undefined;
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const stringValue = optionalString(value);
  return stringValue ? Number(stringValue) : undefined;
}

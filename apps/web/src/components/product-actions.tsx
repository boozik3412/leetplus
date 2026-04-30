"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import type { Category, Supplier } from "@/lib/catalog";
import type { Product } from "@/lib/products";

type ProductFormOptions = {
  categories: Category[];
  suppliers: Supplier[];
};

type ErrorResponse = {
  message?: string;
};

type InlineProductField =
  | "article"
  | "name"
  | "purchasePrice"
  | "salePrice"
  | "facing"
  | "shelfLifeDays";

function getErrorMessage(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return "Не удалось сохранить товар";
}

export function ProductCreateForm({ categories, suppliers }: ProductFormOptions) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = event.currentTarget;
    const response = await submitProductForm("/api/products", "POST", form);

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
      className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <div>
        <h2 className="text-base font-semibold">Новый товар</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Товар создаётся в текущем tenant и сразу попадает в ассортимент.
        </p>
      </div>

      <ProductFields categories={categories} suppliers={suppliers} />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isSubmitting ? "Сохранение..." : "Добавить товар"}
      </button>
    </form>
  );
}

export function ProductEditRow({
  product,
  categories,
  suppliers,
}: ProductFormOptions & {
  product: Product;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await submitProductForm(
      `/api/products/${product.id}`,
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
    <tr className="bg-zinc-50/70">
      <td colSpan={10} className="px-5 py-4">
        <form onSubmit={handleSubmit} className="grid gap-3">
          <ProductFields
            product={product}
            categories={categories}
            suppliers={suppliers}
            dense
          />

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {isSubmitting ? "Сохранение..." : "Обновить"}
            </button>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        </form>
      </td>
    </tr>
  );
}

export function ProductArchiveButton({ id }: { id: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleClick() {
    setIsSubmitting(true);
    const response = await fetch(`/api/products/${id}`, {
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
      {isSubmitting ? "..." : "Архивировать"}
    </button>
  );
}

export function ProductInlineEditable({
  product,
  field,
  value,
  displayValue,
  inputType = "text",
  canEdit,
}: {
  product: Product;
  field: InlineProductField;
  value: string;
  displayValue?: string;
  inputType?: "text" | "number";
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  async function save() {
    const normalizedDraft = draft.trim();

    if (normalizedDraft === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setHasError(false);

    const response = await fetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildInlinePayload(product, field, normalizedDraft)),
    });

    setIsSaving(false);

    if (!response.ok) {
      setHasError(true);
      return;
    }

    setIsEditing(false);
    router.refresh();
  }

  function cancel() {
    setDraft(value);
    setHasError(false);
    setIsEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  if (!canEdit) {
    return <span>{displayValue ?? value}</span>;
  }

  if (isEditing) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <input
          ref={inputRef}
          type={inputType}
          min={inputType === "number" ? "0" : undefined}
          step={
            field === "purchasePrice" || field === "salePrice"
              ? "0.01"
              : inputType === "number"
                ? "1"
                : undefined
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className={[
            "w-full min-w-24 rounded-md border bg-white px-2 py-1 text-sm outline-none focus:ring-2",
            hasError
              ? "border-red-300 focus:border-red-500 focus:ring-red-100"
              : "border-zinc-300 focus:border-zinc-500 focus:ring-zinc-200",
          ].join(" ")}
        />
        {hasError ? (
          <span className="text-xs text-red-600">Не сохранено</span>
        ) : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      onDoubleClick={() => {
        setDraft(value);
        setIsEditing(true);
      }}
      title="Двойной клик для редактирования"
      className="rounded-md px-1 py-0.5 text-left transition hover:bg-zinc-100"
    >
      {displayValue ?? value}
    </button>
  );
}

function ProductFields({
  product,
  categories,
  suppliers,
  dense = false,
}: ProductFormOptions & {
  product?: Product;
  dense?: boolean;
}) {
  return (
    <div
      className={
        dense
          ? "grid gap-3 lg:grid-cols-8"
          : "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      }
    >
      <Input
        name="article"
        defaultValue={product?.article}
        placeholder="Артикул"
        required
      />
      <Input
        name="name"
        defaultValue={product?.name}
        placeholder="Наименование"
        required
      />
      <Input
        name="purchasePrice"
        type="number"
        min="0"
        step="0.01"
        defaultValue={product?.purchasePrice}
        placeholder="Входящая цена"
        required
      />
      <Input
        name="salePrice"
        type="number"
        min="0"
        step="0.01"
        defaultValue={product?.salePrice}
        placeholder="Цена продажи"
        required
      />
      <Input
        name="facing"
        type="number"
        min="0"
        defaultValue={String(product?.facing ?? 1)}
        placeholder="Фейсинг"
      />
      <Input
        name="shelfLifeDays"
        type="number"
        min="0"
        defaultValue={product?.shelfLifeDays ?? ""}
        placeholder="Срок, дней"
      />
      <select
        name="categoryId"
        defaultValue={product?.categoryId ?? ""}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
      >
        <option value="">Без категории</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <select
        name="supplierId"
        defaultValue={product?.supplierId ?? ""}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
      >
        <option value="">Без поставщика</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Input({
  defaultValue,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className">) {
  return (
    <input
      {...props}
      defaultValue={defaultValue}
      className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
    />
  );
}

async function submitProductForm(
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
      article: requiredString(formData.get("article")),
      name: requiredString(formData.get("name")),
      purchasePrice: requiredString(formData.get("purchasePrice")),
      salePrice: requiredString(formData.get("salePrice")),
      facing: parseOptionalNumber(formData.get("facing")) ?? 1,
      shelfLifeDays: parseNullableNumber(formData.get("shelfLifeDays")),
      categoryId: optionalString(formData.get("categoryId")) ?? null,
      supplierId: optionalString(formData.get("supplierId")) ?? null,
    }),
  });
}

function buildInlinePayload(
  product: Product,
  field: InlineProductField,
  value: string,
) {
  const base = {
    article: product.article,
    name: product.name,
    purchasePrice: product.purchasePrice,
    salePrice: product.salePrice,
    facing: product.facing,
    shelfLifeDays: product.shelfLifeDays,
    categoryId: product.categoryId,
    supplierId: product.supplierId,
  };

  if (field === "facing") {
    return { ...base, facing: Number(value || 0) };
  }

  if (field === "shelfLifeDays") {
    return { ...base, shelfLifeDays: value ? Number(value) : null };
  }

  return { ...base, [field]: value };
}

function requiredString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function optionalString(value: FormDataEntryValue | null) {
  const stringValue = requiredString(value);
  return stringValue || undefined;
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const stringValue = optionalString(value);
  return stringValue ? Number(stringValue) : undefined;
}

function parseNullableNumber(value: FormDataEntryValue | null) {
  return parseOptionalNumber(value) ?? null;
}

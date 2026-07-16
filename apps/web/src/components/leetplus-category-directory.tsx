"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/lib/catalog";

function errorMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return "Не удалось сохранить изменения";
}

export function LeetplusCategoryDirectory({
  categories,
  canEditCatalog,
}: {
  categories: Category[];
  canEditCatalog: boolean;
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPendingId("new");
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(errorMessage(payload));
        return;
      }

      event.currentTarget.reset();
      setIsAdding(false);
      router.refresh();
    } catch {
      setError("API недоступен");
    } finally {
      setPendingId(null);
    }
  }

  async function renameCategory(
    event: FormEvent<HTMLFormElement>,
    category: Category,
  ) {
    event.preventDefault();
    setError(null);
    setPendingId(category.id);
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();

    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(errorMessage(payload));
        return;
      }

      setEditingId(null);
      router.refresh();
    } catch {
      setError("API недоступен");
    } finally {
      setPendingId(null);
    }
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`Удалить категорию «${category.name}»?`)) {
      return;
    }

    setError(null);
    setPendingId(category.id);

    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(errorMessage(payload));
        return;
      }

      router.refresh();
    } catch {
      setError("API недоступен");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-base font-semibold text-zinc-950">
              Внутренние категории LeetPlus
            </h2>
            <span className="text-sm text-zinc-500">{categories.length}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Это ваш собственный справочник. Он не изменяется синхронизацией Langame.
          </p>
        </div>
        {canEditCatalog ? (
          <button
            type="button"
            onClick={() => {
              setIsAdding((current) => !current);
              setError(null);
            }}
            className="self-start rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:self-auto"
          >
            {isAdding ? "Закрыть" : "Добавить категорию"}
          </button>
        ) : null}
      </div>

      {isAdding ? (
        <form
          onSubmit={createCategory}
          className="flex flex-col gap-2 border-t border-zinc-100 bg-zinc-50 px-5 py-3 sm:flex-row"
        >
          <input
            name="name"
            required
            autoFocus
            placeholder="Название категории"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          />
          <button
            type="submit"
            disabled={pendingId === "new"}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
          >
            {pendingId === "new" ? "Добавление..." : "Добавить"}
          </button>
        </form>
      ) : null}

      <div className="border-t border-zinc-100 px-5 py-4">
        {categories.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className="rounded-md border border-zinc-200 px-3 py-2.5"
              >
                {editingId === category.id ? (
                  <form
                    onSubmit={(event) => renameCategory(event, category)}
                    className="flex gap-2"
                  >
                    <input
                      name="name"
                      defaultValue={category.name}
                      required
                      autoFocus
                      className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-500"
                    />
                    <button
                      type="submit"
                      disabled={pendingId === category.id}
                      className="text-xs font-medium text-sky-700 hover:text-sky-900 disabled:text-zinc-400"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs text-zinc-500 hover:text-zinc-800"
                    >
                      Отмена
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-zinc-900">
                        {category.name}
                      </p>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {category._count.products} SKU
                      </span>
                    </div>
                    {canEditCatalog ? (
                      <div className="mt-2 flex gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(category.id);
                            setError(null);
                          }}
                          className="text-zinc-600 hover:text-zinc-950"
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(category)}
                          disabled={pendingId === category.id}
                          className="text-zinc-500 hover:text-red-700 disabled:text-zinc-300"
                        >
                          {pendingId === category.id ? "Удаление..." : "Удалить"}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Внутренних категорий пока нет.</p>
        )}
      </div>

      {error ? <p className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}

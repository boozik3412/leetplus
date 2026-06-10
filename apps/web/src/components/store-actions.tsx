"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Store } from "@/lib/stores";

type ErrorResponse = {
  message?: string;
};

type AddressSuggestion = {
  value: string;
  city: string;
  region: string | null;
  cityFiasId: string | null;
  cityKladrId: string | null;
  timeZone: string | null;
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
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
    <form onSubmit={handleSubmit} className="grid min-w-[720px] gap-2">
      <div className="grid gap-2 md:grid-cols-5">
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
  const [city, setCity] = useState(store?.city ?? "");
  const [timeZone, setTimeZone] = useState(store?.timeZone ?? "");
  const [cityFiasId, setCityFiasId] = useState(store?.cityFiasId ?? "");
  const [cityKladrId, setCityKladrId] = useState(store?.cityKladrId ?? "");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);

  useEffect(() => {
    const query = city.trim();

    if (query.length < 2 || cityFiasId) {
      return;
    }

    const abortController = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSuggesting(true);

      try {
        const response = await fetch(
          `/api/stores/address-suggestions?q=${encodeURIComponent(query)}`,
          {
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          setSuggestions([]);
          return;
        }

        const data = (await response.json()) as AddressSuggestion[];
        setSuggestions(data);
        setIsSuggestionOpen(data.length > 0);
      } catch {
        if (!abortController.signal.aborted) {
          setSuggestions([]);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsSuggesting(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [city, cityFiasId]);

  function handleCityChange(value: string) {
    setCity(value);
    setCityFiasId("");
    setCityKladrId("");
    setTimeZone("");
    setSuggestions([]);
    setIsSuggestionOpen(true);
  }

  function handleSuggestionSelect(suggestion: AddressSuggestion) {
    setCity(suggestion.city);
    setTimeZone(suggestion.timeZone ?? "");
    setCityFiasId(suggestion.cityFiasId ?? "");
    setCityKladrId(suggestion.cityKladrId ?? "");
    setSuggestions([]);
    setIsSuggestionOpen(false);
  }

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
      <div className="relative">
        <input
          name="city"
          value={city}
          onChange={(event) => handleCityChange(event.target.value)}
          onFocus={() => setIsSuggestionOpen(suggestions.length > 0)}
          placeholder="Город"
          autoComplete="off"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
        {isSuggestionOpen && suggestions.length > 0 ? (
          <div className="absolute left-0 right-0 top-11 z-20 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.cityFiasId ?? suggestion.value}-${suggestion.city}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSuggestionSelect(suggestion)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
              >
                <span className="block font-medium text-zinc-900">
                  {suggestion.city}
                </span>
                <span className="block text-xs text-zinc-500">
                  {[suggestion.region, suggestion.timeZone]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {isSuggesting ? (
          <span className="absolute right-3 top-2.5 text-xs text-zinc-400">
            ...
          </span>
        ) : null}
      </div>
      <input
        name="timeZone"
        value={timeZone}
        readOnly
        placeholder="Часовой пояс"
        title="Подставляется автоматически по городу"
        className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 outline-none"
      />
      <input name="cityFiasId" type="hidden" value={cityFiasId} readOnly />
      <input name="cityKladrId" type="hidden" value={cityKladrId} readOnly />
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
      city: optionalString(formData.get("city")) ?? null,
      cityFiasId: optionalString(formData.get("cityFiasId")) ?? null,
      cityKladrId: optionalString(formData.get("cityKladrId")) ?? null,
      timeZone: optionalString(formData.get("timeZone")) ?? null,
    }),
  });
}

function optionalString(value: FormDataEntryValue | null) {
  const stringValue = String(value ?? "").trim();
  return stringValue || undefined;
}

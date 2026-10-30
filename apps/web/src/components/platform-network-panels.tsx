"use client";

import { useState } from "react";

type AccessChoice = "OPEN_ENDED" | "DAYS";

type OwnerLink = {
  inviteId: string;
  expiresAt: string;
  registrationUrl: string;
};

type CreateNetworkResult = {
  tenant: { id: string; name: string; slug: string };
  ownerLink: OwnerLink;
};

type NetworkActionsTenant = {
  id: string;
  name: string;
  slug: string;
  customerStage: "INTERNAL" | "PILOT" | "BETA" | "LIVE";
  usersCount: number;
  storesCount: number;
  productsCount: number;
  salesFactsCount: number;
  langameSources: unknown[];
};

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition hover:border-emerald-400 focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950";
const labelClass = "text-xs font-semibold uppercase text-zinc-500";

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Suggests a tenant slug from the network name: latin, digits, hyphens. */
export function suggestNetworkSlug(name: string): string {
  return Array.from(name.toLowerCase())
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) {
      return data.message.join(". ");
    }
    return data.message ?? "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function OwnerLinkBox({ link }: { link: OwnerLink }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.registrationUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-100">
        Ссылка для владельца сети. Она показывается один раз, не хранится в
        журнале и действует до {formatDate(link.expiresAt)}. Владелец сам
        укажет email для входа и пароль.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={link.registrationUrl}
          aria-label="Ссылка регистрации владельца сети"
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-amber-500/30 bg-white px-3 py-2 text-xs outline-none dark:bg-zinc-950"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-lg border border-amber-500/40 bg-white px-3 py-2 text-xs font-semibold transition hover:border-amber-500 dark:bg-zinc-950"
        >
          {copyState === "copied" ? "Скопировано" : "Копировать"}
        </button>
      </div>
      {copyState === "failed" ? (
        <p className="mt-2 text-xs text-red-700 dark:text-red-200">
          Не удалось скопировать автоматически. Скопируйте ссылку из поля.
        </p>
      ) : null}
    </div>
  );
}

/** Platform-admin form: a new network plus a one-time owner link. */
export function PlatformNetworkCreatePanel({
  onCreated,
}: {
  onCreated: () => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [accessChoice, setAccessChoice] = useState<AccessChoice>("OPEN_ENDED");
  const [accessDays, setAccessDays] = useState("30");
  const [linkDays, setLinkDays] = useState("7");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateNetworkResult | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setCreated(null);

    const response = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantName: name.trim(),
        tenantSlug: slug.trim(),
        accessDays:
          accessChoice === "OPEN_ENDED" ? null : Number.parseInt(accessDays, 10),
        linkExpiresInDays: Number.parseInt(linkDays, 10),
      }),
    });

    if (!response.ok) {
      setError(await readError(response));
      setIsSubmitting(false);
      return;
    }

    setCreated((await response.json()) as CreateNetworkResult);
    setName("");
    setSlug("");
    setSlugEdited(false);
    setIsSubmitting(false);
    await onCreated();
  }

  return (
    <section
      id="new-network"
      className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
        Новая сеть
      </p>
      <h2 className="mt-1 text-base font-semibold">
        Создать сеть и ссылку для владельца
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        Сеть создаётся без клубов, со всеми модулями и выключенными внешними
        рассылками. Владелец регистрируется по ссылке, затем сам добавляет
        клубы и сотрудников. Письма не отправляются.
      </p>
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <label className="block text-sm">
          <span className={labelClass}>Название сети</span>
          <input
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugEdited) {
                setSlug(suggestNetworkSlug(event.target.value));
              }
            }}
            placeholder="Тестовая сеть"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className={labelClass}>Адрес (slug)</span>
          <input
            required
            minLength={3}
            maxLength={63}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value.toLowerCase());
              setSlugEdited(true);
            }}
            placeholder="test-network"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className={labelClass}>Доступ сети</span>
          <div className="flex gap-2">
            <select
              value={accessChoice}
              onChange={(event) =>
                setAccessChoice(event.target.value as AccessChoice)
              }
              className={inputClass}
            >
              <option value="OPEN_ENDED">Бессрочно</option>
              <option value="DAYS">На N дней</option>
            </select>
            {accessChoice === "DAYS" ? (
              <input
                type="number"
                min={1}
                max={3650}
                required
                value={accessDays}
                onChange={(event) => setAccessDays(event.target.value)}
                aria-label="Дней доступа"
                className={`${inputClass} w-24`}
              />
            ) : null}
          </div>
        </label>
        <label className="block text-sm">
          <span className={labelClass}>Ссылка действует, дней</span>
          <input
            type="number"
            min={1}
            max={30}
            required
            value={linkDays}
            onChange={(event) => setLinkDays(event.target.value)}
            className={inputClass}
          />
        </label>
        <div className="md:col-span-2 xl:col-span-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Создаём сеть…" : "Создать сеть"}
          </button>
        </div>
      </form>
      {error ? (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {created ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Сеть «{created.tenant.name}» ({created.tenant.slug}) создана.
          </p>
          <OwnerLinkBox link={created.ownerLink} />
        </div>
      ) : null}
    </section>
  );
}

/**
 * Per-network platform actions: a fresh owner link for an external network
 * that has no owner yet, and permanent deletion of an empty network.
 */
export function PlatformNetworkActionsPanel({
  tenant,
  onChanged,
}: {
  tenant: NetworkActionsTenant;
  onChanged: () => Promise<void> | void;
}) {
  const [link, setLink] = useState<OwnerLink | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isEmpty =
    tenant.productsCount === 0 &&
    tenant.salesFactsCount === 0 &&
    tenant.langameSources.length === 0;
  const expectedConfirmation = `DELETE ${tenant.slug}`;
  const canIssueOwnerLink = tenant.customerStage !== "INTERNAL";

  if (!isEmpty && !canIssueOwnerLink) {
    return null;
  }

  async function issueOwnerLink() {
    setIsIssuing(true);
    setLinkError(null);
    setLink(null);
    const response = await fetch(`/api/admin/tenants/${tenant.id}/owner-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: tenant.slug }),
    });
    if (!response.ok) {
      setLinkError(await readError(response));
      setIsIssuing(false);
      return;
    }
    const result = (await response.json()) as { ownerLink: OwnerLink };
    setLink(result.ownerLink);
    setIsIssuing(false);
    await onChanged();
  }

  async function deleteNetwork() {
    setIsDeleting(true);
    setDeleteError(null);
    const response = await fetch(`/api/admin/tenants/${tenant.id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: deleteConfirmation.trim() }),
    });
    if (!response.ok) {
      setDeleteError(await readError(response));
      setIsDeleting(false);
      return;
    }
    setIsDeleting(false);
    await onChanged();
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase text-zinc-500">
        Управление сетью
      </p>

      {canIssueOwnerLink ? (
        <div className="mt-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Если владелец ещё не зарегистрировался, можно выдать новую ссылку.
            Прежняя ссылка перестанет работать.
          </p>
          <button
            type="button"
            disabled={isIssuing}
            onClick={() => void issueOwnerLink()}
            className="mt-2 rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-200"
          >
            {isIssuing ? "Выдаём ссылку…" : "Новая ссылка владельцу"}
          </button>
          {link ? <OwnerLinkBox link={link} /> : null}
          {linkError ? (
            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
              {linkError}
            </p>
          ) : null}
        </div>
      ) : null}

      {isEmpty ? (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-sm font-semibold text-red-700 dark:text-red-200">
            Удалить сеть
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            Удаляется навсегда вместе с клубами ({tenant.storesCount}) и
            учётными записями ({tenant.usersCount}). Доступно только для сети
            без товаров, продаж, гостей и интеграций. Если кто-то уже
            зарегистрировался в сети по приглашению, удаление будет отклонено.
            Для подтверждения введите{" "}
            <code className="font-semibold">{expectedConfirmation}</code>.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder={expectedConfirmation}
              aria-label="Подтверждение удаления сети"
              className="min-w-0 flex-1 rounded-lg border border-red-500/30 bg-white px-3 py-2 text-xs outline-none dark:bg-zinc-950"
            />
            <button
              type="button"
              disabled={
                isDeleting || deleteConfirmation.trim() !== expectedConfirmation
              }
              onClick={() => void deleteNetwork()}
              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? "Удаляем…" : "Удалить навсегда"}
            </button>
          </div>
          {deleteError ? (
            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
              {deleteError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

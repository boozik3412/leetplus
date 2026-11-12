"use client";

import { useId, useMemo, useState } from "react";
import type {
  MarketingCampaignTelegram,
  MarketingCampaignTelegramTrigger,
  MarketingCampaignTelegramType,
} from "@/lib/marketing";
import {
  MarketingCampaignTelegramAutomationCard,
  triggerDays,
  triggerOptions,
} from "./marketing-campaign-telegram-automation";

const TEXT_MAX = 1500;
const BUTTON_TEXT_MAX = 40;

const typeOptions: Array<{
  id: MarketingCampaignTelegramType;
  label: string;
  hint: string;
}> = [
  {
    id: "NEWS",
    label: "Новость клуба",
    hint: "Изменения в клубе, расписание, турниры. Уходит всем гостям с Telegram, кроме отписавшихся.",
  },
  {
    id: "PROMO",
    label: "Акция или реклама",
    hint: "Скидки, бонусы, предложения. По закону о рекламе уходит только гостям, которые нажали в боте «Присылать акции клуба».",
  },
];

type SendMode = "MANUAL" | "AUTO";

type Props = {
  campaignId: string;
  initial: MarketingCampaignTelegram | null;
};

type ApiError = { message?: string | string[] } | null;

async function readError(response: Response, fallback: string) {
  if (response.status === 403) {
    return "Отправлять рассылку может сотрудник с доступом ко всей сети клубов.";
  }
  const data = (await response.json().catch(() => null)) as ApiError;
  const message = Array.isArray(data?.message)
    ? data?.message.join(" ")
    : data?.message;
  return message || fallback;
}

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MarketingCampaignTelegramPanel({ campaignId, initial }: Props) {
  const ids = useId();
  const [summary, setSummary] = useState(initial);
  const [type, setType] = useState<MarketingCampaignTelegramType>(
    initial?.draft?.type ?? "NEWS",
  );
  const [text, setText] = useState(initial?.draft?.text ?? "");
  const [buttonText, setButtonText] = useState(
    initial?.draft?.buttonText ?? "",
  );
  const [buttonUrl, setButtonUrl] = useState(initial?.draft?.buttonUrl ?? "");
  const [mode, setMode] = useState<SendMode>(
    initial?.automation ? "AUTO" : "MANUAL",
  );
  const [trigger, setTrigger] = useState<MarketingCampaignTelegramTrigger>(
    initial?.automation?.trigger ?? "LAPSED",
  );
  const [days, setDays] = useState(
    String(initial?.automation?.days ?? triggerDays.LAPSED.default),
  );
  const [pending, setPending] = useState<"save" | "send" | "automation" | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const saved = summary?.draft ?? null;
  const savedAutomation = summary?.automation ?? null;
  const ruleDirty =
    mode === "AUTO" &&
    (!savedAutomation ||
      savedAutomation.trigger !== trigger ||
      String(savedAutomation.days) !== days.trim());
  const dirty =
    !saved ||
    saved.type !== type ||
    saved.text !== text.trim() ||
    (saved.buttonText ?? "") !== buttonText.trim() ||
    (saved.buttonUrl ?? "") !== buttonUrl.trim() ||
    ruleDirty;

  const previewButtons = useMemo(() => {
    const buttons: string[] = [];
    if (buttonText.trim() && buttonUrl.trim()) {
      buttons.push(buttonText.trim());
    }
    buttons.push(type === "PROMO" ? "Не присылать акции" : "Отписаться");
    return buttons;
  }, [buttonText, buttonUrl, type]);

  if (!summary) {
    return (
      <section
        id="telegram"
        className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="text-xl font-semibold">Рассылка в Telegram</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Не удалось загрузить данные рассылки. Обновите страницу; если ошибка
          повторяется, проверьте, что у вас есть доступ к маркетингу.
        </p>
      </section>
    );
  }

  async function saveDraft() {
    setError(null);
    setNotice(null);
    setPending("save");
    try {
      const response = await fetch(
        `/api/marketing/campaigns/${encodeURIComponent(campaignId)}/telegram/draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            text,
            buttonText: buttonText.trim() || null,
            buttonUrl: buttonUrl.trim() || null,
          }),
        },
      );
      if (!response.ok) {
        setError(await readError(response, "Не удалось сохранить текст"));
        return;
      }
      let next = (await response.json()) as MarketingCampaignTelegram;
      if (mode === "AUTO") {
        const rule = await postAutomation({
          trigger,
          days: Number(days.trim()),
        });
        if (!rule.ok) {
          setSummary(next);
          setError(rule.error);
          return;
        }
        next = rule.summary;
      }
      setSummary(next);
      if (next.draft) {
        // The server trims the text and normalizes the link; mirror it so
        // the form does not look unsaved right after saving.
        setText(next.draft.text);
        setButtonText(next.draft.buttonText ?? "");
        setButtonUrl(next.draft.buttonUrl ?? "");
      }
      setNotice(
        mode === "AUTO"
          ? "Текст и правило сохранены. Проверьте, кто подходит под правило сейчас."
          : "Текст сохранён. Проверьте, сколько гостей получат сообщение.",
      );
    } catch {
      setError("Не удалось сохранить текст. Проверьте связь и повторите.");
    } finally {
      setPending(null);
    }
  }

  async function postAutomation(
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; summary: MarketingCampaignTelegram }
    | { ok: false; error: string }
  > {
    const response = await fetch(
      `/api/marketing/campaigns/${encodeURIComponent(campaignId)}/telegram/automation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        error: await readError(response, "Не удалось сохранить правило"),
      };
    }
    return {
      ok: true,
      summary: (await response.json()) as MarketingCampaignTelegram,
    };
  }

  async function setAutomationEnabled(enabled: boolean) {
    setError(null);
    setNotice(null);
    setPending("automation");
    try {
      const result = await postAutomation({ enabled });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSummary(result.summary);
      setNotice(
        enabled
          ? "Автосценарий включён. Первые сообщения уйдут в ближайшие полчаса в дневное время клуба."
          : "Автосценарий выключен. Новые сообщения больше не ставятся в очередь.",
      );
    } catch {
      setError("Не удалось сохранить правило. Проверьте связь и повторите.");
    } finally {
      setPending(null);
    }
  }

  async function chooseMode(next: SendMode) {
    if (next === mode) return;
    setError(null);
    setNotice(null);
    if (next === "AUTO" || !savedAutomation) {
      setMode(next);
      return;
    }
    // Back to a one-off send: the stored (switched off) rule is removed.
    setPending("automation");
    try {
      const result = await postAutomation({ trigger: null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSummary(result.summary);
      setMode("MANUAL");
    } catch {
      setError("Не удалось сменить режим. Проверьте связь и повторите.");
    } finally {
      setPending(null);
    }
  }

  async function send() {
    setError(null);
    setNotice(null);
    setPending("send");
    try {
      const response = await fetch(
        `/api/marketing/campaigns/${encodeURIComponent(campaignId)}/telegram/send`,
        { method: "POST" },
      );
      if (!response.ok) {
        setError(await readError(response, "Не удалось отправить рассылку"));
        return;
      }
      const next = (await response.json()) as MarketingCampaignTelegram & {
        queued: number;
      };
      setSummary(next);
      setNotice(
        next.queued > 0
          ? `Рассылка запущена: ${formatNumber(next.queued)} сообщений уходят гостям. Статусы обновятся в течение нескольких минут.`
          : "Новых получателей нет: все подходящие гости уже получили это сообщение.",
      );
    } catch {
      setError("Не удалось отправить рассылку. Проверьте связь и повторите.");
    } finally {
      setPending(null);
      setConfirming(false);
    }
  }

  const { reach, delivery } = summary;
  const reachRows: Array<{ label: string; value: number; hint?: string }> = [
    { label: "Гостей в группе", value: reach.audienceTotal },
    {
      label: "Вошли в игру через Telegram",
      value: reach.withTelegram,
      hint: "Писать можно только тем, кто хотя бы раз открыл бота.",
    },
    { label: "Отписались от сообщений", value: reach.unsubscribed },
    ...(saved?.type === "PROMO"
      ? [
          {
            label: "Не согласились на акции",
            value: reach.noPromoConsent,
          },
        ]
      : []),
    {
      label: `Получали рассылку за ${summary.frequencyDays} дня`,
      value: reach.recentlyMessaged,
      hint: "Не чаще одного сообщения в три дня, чтобы гости не отписывались.",
    },
    { label: "Уже получили эту рассылку", value: reach.alreadyQueued },
  ];
  const canSend =
    Boolean(summary.audience) &&
    Boolean(saved) &&
    !dirty &&
    reach.willReceive > 0 &&
    pending === null;
  const textCount = text.length;

  return (
    <section
      id="telegram"
      className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]"
    >
      <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Telegram-бот
          </p>
          <h2 className="mt-2 text-xl font-semibold">Сообщение гостям</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {mode === "AUTO"
              ? "Сообщение придёт от игрового бота клуба каждому гостю, который подходит под правило, один раз на случай."
              : `Сообщение придёт от игрового бота клуба гостям из группы «${summary.audience?.name ?? "—"}».`}{" "}
            Под ним всегда есть кнопка отписки. Ответы гостей попадут в
            «Поддержку».
          </p>
        </div>

        {mode === "MANUAL" && !summary.audience ? (
          <p className="m-5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            У кампании нет группы гостей. Выберите группу при создании кампании
            в «Маркетинге», затем вернитесь сюда.
          </p>
        ) : null}

        <div className="grid gap-5 p-5">
          <fieldset>
            <legend className="text-sm font-semibold">Что отправляем</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {typeOptions.map((option) => (
                <label
                  key={option.id}
                  className={`cursor-pointer rounded-lg border p-3 text-sm transition focus-within:ring-2 focus-within:ring-emerald-500 ${
                    type === option.id
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-zinc-200 hover:border-emerald-400 dark:border-zinc-800"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name={`${ids}-type`}
                      value={option.id}
                      checked={type === option.id}
                      onChange={() => setType(option.id)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                    {option.hint}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">Как отправлять</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    id: "MANUAL",
                    label: "Один раз",
                    hint: "Вы сами нажимаете «Отправить», сообщение уходит группе гостей кампании.",
                  },
                  {
                    id: "AUTO",
                    label: "Автоматически",
                    hint: "Пока кампания идёт, сообщение само уходит каждому новому гостю, который подходит под правило.",
                  },
                ] as const
              ).map((option) => {
                const locked =
                  option.id === "MANUAL" && Boolean(savedAutomation?.enabled);
                return (
                  <label
                    key={option.id}
                    className={`rounded-lg border p-3 text-sm transition focus-within:ring-2 focus-within:ring-emerald-500 ${
                      locked
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer"
                    } ${
                      mode === option.id
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                        : "border-zinc-200 hover:border-emerald-400 dark:border-zinc-800"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <input
                        type="radio"
                        name={`${ids}-mode`}
                        value={option.id}
                        checked={mode === option.id}
                        disabled={locked || pending !== null}
                        onChange={() => void chooseMode(option.id)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                      {locked
                        ? "Сначала выключите автосценарий справа."
                        : option.hint}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {mode === "AUTO" ? (
            <fieldset>
              <legend className="text-sm font-semibold">Кому и когда</legend>
              <div className="mt-2 grid gap-2">
                {triggerOptions.map((option) => (
                  <label
                    key={option.id}
                    className={`cursor-pointer rounded-lg border p-3 text-sm transition focus-within:ring-2 focus-within:ring-emerald-500 ${
                      trigger === option.id
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                        : "border-zinc-200 hover:border-emerald-400 dark:border-zinc-800"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <input
                        type="radio"
                        name={`${ids}-trigger`}
                        value={option.id}
                        checked={trigger === option.id}
                        onChange={() => {
                          setTrigger(option.id);
                          setDays(
                            String(
                              savedAutomation?.trigger === option.id
                                ? savedAutomation.days
                                : triggerDays[option.id].default,
                            ),
                          );
                        }}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                      {option.hint}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor={`${ids}-days`}>
                  {triggerOptions.find((option) => option.id === trigger)
                    ?.daysLabel ?? "Дней"}
                </label>
                <input
                  id={`${ids}-days`}
                  type="number"
                  inputMode="numeric"
                  min={triggerDays[trigger].min}
                  max={triggerDays[trigger].max}
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                  aria-describedby={`${ids}-days-hint`}
                  className="min-h-10 w-24 rounded-md border border-zinc-300 bg-white px-3 text-sm tabular-nums text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <span
                  id={`${ids}-days-hint`}
                  className="text-xs text-zinc-500 dark:text-zinc-400"
                >
                  от {triggerDays[trigger].min} до {triggerDays[trigger].max}
                </span>
              </div>
            </fieldset>
          ) : null}

          <div>
            <label htmlFor={`${ids}-text`} className="text-sm font-semibold">
              Текст сообщения
            </label>
            <textarea
              id={`${ids}-text`}
              value={text}
              maxLength={TEXT_MAX}
              onChange={(event) => setText(event.target.value)}
              rows={7}
              aria-describedby={`${ids}-text-count`}
              placeholder="Например: В эту субботу турнир по CS2, приходите с командой."
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white p-3 text-sm leading-6 text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <p
              id={`${ids}-text-count`}
              className="mt-1 text-xs text-zinc-500 tabular-nums dark:text-zinc-400"
            >
              {formatNumber(textCount)} из {formatNumber(TEXT_MAX)} символов.
              Подпись «{summary.signature}» добавится сама.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${ids}-button-text`}
                className="text-sm font-semibold"
              >
                Кнопка со ссылкой{" "}
                <span className="font-normal text-zinc-500">
                  (необязательно)
                </span>
              </label>
              <input
                id={`${ids}-button-text`}
                value={buttonText}
                maxLength={BUTTON_TEXT_MAX}
                onChange={(event) => setButtonText(event.target.value)}
                placeholder="Записаться на турнир"
                className="mt-2 min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label
                htmlFor={`${ids}-button-url`}
                className="text-sm font-semibold"
              >
                Ссылка кнопки
              </label>
              <input
                id={`${ids}-button-url`}
                type="url"
                inputMode="url"
                value={buttonUrl}
                onChange={(event) => setButtonUrl(event.target.value)}
                placeholder="https://..."
                className="mt-2 min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveDraft}
              disabled={pending !== null || !text.trim()}
              className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              {pending === "save" ? "Сохраняем..." : "Сохранить и посчитать"}
            </button>
            {dirty && saved ? (
              <span className="text-xs text-amber-700 dark:text-amber-300">
                Есть несохранённые изменения
              </span>
            ) : null}
          </div>

          <div aria-live="polite">
            {error ? (
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {notice}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold">Так увидит гость</h3>
          <div className="mt-3 rounded-lg bg-zinc-100 p-3 dark:bg-zinc-900">
            <div className="rounded-lg bg-white p-3 text-sm leading-6 whitespace-pre-wrap text-zinc-900 shadow-sm [overflow-wrap:anywhere] dark:bg-zinc-800 dark:text-zinc-100">
              {text.trim() || (
                <span className="text-zinc-500 dark:text-zinc-400">
                  Текст появится здесь
                </span>
              )}
              {"\n\n"}— {summary.signature}
            </div>
            <div className="mt-2 grid gap-1">
              {previewButtons.map((label) => (
                <span
                  key={label}
                  className="rounded-md bg-white/80 px-3 py-2 text-center text-sm font-medium text-sky-700 dark:bg-zinc-800/80 dark:text-sky-300"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {mode === "AUTO" ? (
          <MarketingCampaignTelegramAutomationCard
            automation={savedAutomation}
            campaignStatus={summary.campaignStatus}
            promo={saved?.type === "PROMO"}
            frequencyDays={summary.frequencyDays}
            hasText={Boolean(saved)}
            dirty={dirty}
            pending={pending === "automation"}
            disabled={pending !== null}
            onToggle={(enabled) => void setAutomationEnabled(enabled)}
          />
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-sm font-semibold">Кто получит</h3>
            {dirty ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Числа пересчитаются после сохранения.
              </p>
            ) : null}
            <dl className="mt-3 grid gap-2 text-sm">
              {reachRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-start justify-between gap-3"
                >
                  <dt className="min-w-0 text-zinc-600 dark:text-zinc-400">
                    {row.label}
                    {row.hint ? (
                      <span className="block text-xs text-zinc-500">
                        {row.hint}
                      </span>
                    ) : null}
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {formatNumber(row.value)}
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                <dt className="font-semibold">Получат сообщение</dt>
                <dd className="text-lg font-semibold text-emerald-700 tabular-nums dark:text-emerald-300">
                  {formatNumber(reach.willReceive)}
                </dd>
              </div>
            </dl>

            {confirming ? (
              <div className="mt-4 rounded-md border border-emerald-500 p-3">
                <p className="text-sm font-semibold">
                  Отправить сообщение {formatNumber(reach.willReceive)} гостям?
                  Отменить отправку будет нельзя.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={send}
                    disabled={pending !== null}
                    className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-wait disabled:opacity-70"
                  >
                    {pending === "send" ? "Отправляем..." : "Да, отправить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={pending !== null}
                    className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={!canSend}
                className="mt-4 inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Отправить в Telegram
              </button>
            )}
            {!saved ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Сначала напишите и сохраните текст.
              </p>
            ) : null}
          </div>
        )}

        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold">Доставка</h3>
          {delivery.total === 0 ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {mode === "AUTO"
                ? "Автосценарий ещё ничего не отправлял."
                : "Рассылку ещё не отправляли."}
            </p>
          ) : (
            <>
              {mode === "MANUAL" && summary.lastSentAt ? (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Последний запуск {formatDate(summary.lastSentAt)}
                </p>
              ) : null}
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {[
                  { label: "Доставлено", value: delivery.sent },
                  { label: "В очереди", value: delivery.queued },
                  { label: "Заблокировали бота", value: delivery.blocked },
                  { label: "Пропущено", value: delivery.skipped },
                  { label: "Ошибка", value: delivery.failed },
                  { label: "Всего", value: delivery.total },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900"
                  >
                    <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                      {item.label}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {formatNumber(item.value)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                Доставленные сообщения попадают в журнал контактов и во вкладку
                «Эффект».
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

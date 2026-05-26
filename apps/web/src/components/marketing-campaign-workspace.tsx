"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type {
  MarketingCampaign,
  MarketingCampaignEffect,
  MarketingCampaignStatus,
} from "@/lib/marketing";

type MarketingCampaignWorkspaceProps = {
  campaign: MarketingCampaign;
  effect: MarketingCampaignEffect | null;
};

type ChecklistItem = {
  title: string;
  description: string;
  done: boolean;
  action: string;
  href: string;
};

type StatusTransition = {
  label: string;
  status: MarketingCampaignStatus;
  tone: "primary" | "secondary" | "danger";
};

type ExecutionPrompt = {
  channel: string;
  headline: string;
  primaryAction: string;
  script: string;
  factsToRecord: string[];
  preflight: string[];
};

const campaignStatusLabels: Record<MarketingCampaignStatus, string> = {
  DRAFT: "Черновик",
  PLANNED: "Запланирована",
  RUNNING: "В работе",
  FINISHED: "Завершена",
  CANCELED: "Отменена",
};

const campaignStatusHints: Record<MarketingCampaignStatus, string> = {
  DRAFT: "Готовим группу, механику и ответственного.",
  PLANNED: "Запуск согласован, осталось начать выполнение.",
  RUNNING: "Контакты и результаты нужно фиксировать в журнале.",
  FINISHED: "Можно смотреть эффект и выводы.",
  CANCELED: "Кампания остановлена, факты сохраняются в истории.",
};

const campaignStatusFlow: MarketingCampaignStatus[] = [
  "DRAFT",
  "PLANNED",
  "RUNNING",
  "FINISHED",
];

export function MarketingCampaignWorkspace({
  campaign,
  effect,
}: MarketingCampaignWorkspaceProps) {
  const router = useRouter();
  const [note, setNote] = useState(campaign.note ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] =
    useState<MarketingCampaignStatus | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checklist = useMemo(
    () => buildChecklist(campaign, effect),
    [campaign, effect],
  );
  const completed = checklist.filter((item) => item.done).length;
  const progress = Math.round((completed / checklist.length) * 100);
  const hasChanges = note.trim() !== (campaign.note ?? "");
  const transitions = campaignStatusTransitions(campaign.status);
  const executionPrompt = useMemo(
    () => buildExecutionPrompt(campaign),
    [campaign],
  );
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  async function saveNote() {
    setError(null);
    setMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(data?.message ?? "Не удалось сохранить заметку");
        return;
      }

      setMessage("Заметка сохранена.");
      startTransition(() => router.refresh());
    } catch {
      setError("Не удалось сохранить заметку");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateStatus(nextStatus: MarketingCampaignStatus) {
    setError(null);
    setMessage(null);
    setUpdatingStatus(nextStatus);

    try {
      const response = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(data?.message ?? "Не удалось обновить статус кампании");
        return;
      }

      setMessage(`Статус изменен: ${campaignStatusLabels[nextStatus]}.`);
      startTransition(() => router.refresh());
    } catch {
      setError("Не удалось обновить статус кампании");
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function copyExecutionPrompt() {
    setCopiedPrompt(false);

    const text = [
      executionPrompt.headline,
      `Канал: ${executionPrompt.channel}`,
      `Действие: ${executionPrompt.primaryAction}`,
      `Скрипт: ${executionPrompt.script}`,
      `Зафиксировать: ${executionPrompt.factsToRecord.join("; ")}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(true);
    } catch {
      setError("Не удалось скопировать инструкцию");
    }
  }

  return (
    <section
      id="launch"
      className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              Рабочий запуск
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Чек-лист и заметки кампании
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Короткая панель подготовки: что уже готово, где нужен следующий
              шаг и что важно помнить по механике кампании.
            </p>
          </div>
          <div className="min-w-40 rounded-lg border border-zinc-200 p-3 text-right dark:border-zinc-800">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Готовность
            </p>
            <p className="mt-1 text-2xl font-semibold">{progress}%</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {completed} из {checklist.length}
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Этап кампании
              </p>
              <p className="mt-1 text-lg font-semibold">
                {campaignStatusLabels[campaign.status]}
              </p>
              <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                {campaignStatusHints[campaign.status]}
              </p>
            </div>
            <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
              {transitions.map((transition) => (
                <button
                  key={transition.status}
                  type="button"
                  disabled={Boolean(updatingStatus) || isPending}
                  onClick={() => updateStatus(transition.status)}
                  className={statusButtonClass(transition.tone)}
                >
                  {updatingStatus === transition.status
                    ? "Обновляем..."
                    : transition.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            {campaignStatusFlow.map((status, index) => {
              const activeIndex = campaignStatusFlow.indexOf(campaign.status);
              const isActive = status === campaign.status;
              const isDone =
                activeIndex >= 0 && index < activeIndex && campaign.status !== "CANCELED";

              return (
                <div
                  key={status}
                  className={
                    isActive
                      ? "rounded-md border border-emerald-400 bg-emerald-50 p-3 dark:bg-emerald-500/10"
                      : isDone
                        ? "rounded-md border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-zinc-950"
                        : "rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                  }
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {index + 1}. {campaignStatusLabels[status]}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                    {campaignStatusHints[status]}
                  </p>
                </div>
              );
            })}
          </div>
          {campaign.status === "CANCELED" ? (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm leading-5 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              Кампания отменена. Ее можно вернуть в работу, если запуск снова
              актуален.
            </p>
          ) : null}
        </div>
        <div className="mt-5 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                Инструкция исполнения
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                {executionPrompt.headline}
              </h3>
              <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                Канал: {executionPrompt.channel}. Действие:{" "}
                {executionPrompt.primaryAction}
              </p>
            </div>
            <button
              type="button"
              onClick={copyExecutionPrompt}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {copiedPrompt ? "Скопировано" : "Скопировать"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Скрипт контакта
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
                {executionPrompt.script}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <ExecutionPromptList
                title="Перед запуском"
                items={executionPrompt.preflight}
              />
              <ExecutionPromptList
                title="Фиксировать результат"
                items={executionPrompt.factsToRecord}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="grid gap-2">
          {checklist.map((item) => (
            <a
              key={item.title}
              href={item.href}
              className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 transition hover:border-emerald-400 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-950 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
            >
              <span
                className={
                  item.done
                    ? "flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-zinc-950"
                    : "flex h-8 w-8 items-center justify-center rounded-full border border-amber-400 text-sm font-bold text-amber-500"
                }
              >
                {item.done ? "OK" : "!"}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{item.title}</span>
                <span className="mt-1 block text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                  {item.description}
                </span>
              </span>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">
                {item.action}
              </span>
            </a>
          ))}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          <label className="grid gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
            Заметка кампании
            <textarea
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setMessage(null);
                setError(null);
              }}
              rows={8}
              maxLength={2000}
              placeholder="Что важно помнить: оффер, ограничения, скрипт контакта, условия для администратора, следующий шаг."
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal leading-6 text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-600"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {note.length}/2000
            </p>
            <button
              type="button"
              disabled={!hasChanges || isSaving || isPending}
              onClick={saveNote}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving || isPending ? "Сохраняем..." : "Сохранить заметку"}
            </button>
          </div>
          {message ? (
            <p className="mt-3 text-sm font-semibold text-emerald-500">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm font-semibold text-red-500">{error}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function buildChecklist(
  campaign: MarketingCampaign,
  effect: MarketingCampaignEffect | null,
): ChecklistItem[] {
  const consentReady =
    !campaign.consentCoverage.requiresPhoneConsent ||
    campaign.consentCoverage.contactable > 0;
  const firstContacts = (effect?.after.contacts ?? 0) > 0;
  const hasEffect =
    (effect?.after.activeGuests ?? 0) > 0 ||
    (effect?.after.totalRevenue ?? 0) > 0 ||
    (effect?.storeBreakdown.length ?? 0) > 0;

  return [
    {
      title: "Группа выбрана",
      description: campaign.audience
        ? `${campaign.audience.name}: ${campaign.audience.guestsCount} гостей`
        : "Выберите группу гостей, чтобы кампания не была абстрактной.",
      done: Boolean(campaign.audience),
      action: campaign.audience ? "Готово" : "Выбрать",
      href: "/guests/report#audiences",
    },
    {
      title: "Согласия проверены",
      description: consentReady
        ? `${campaign.consentCoverage.contactable} гостей доступны для контакта`
        : "Нет доступных контактов по выбранному каналу.",
      done: consentReady,
      action: consentReady ? "Готово" : "Проверить",
      href: "/guests/crm",
    },
    {
      title: "Канал и механика заполнены",
      description:
        campaign.channel && campaign.mechanic
          ? `${campaign.channel}: ${campaign.mechanic}`
          : "Нужны канал и механика, чтобы администратор понимал, что делать.",
      done: Boolean(campaign.channel && campaign.mechanic),
      action: campaign.channel && campaign.mechanic ? "Готово" : "Дополнить",
      href: "/marketing",
    },
    {
      title: "Ответственный и срок назначены",
      description:
        campaign.owner && campaign.dueAt
          ? `${campaign.owner.displayName}, срок ${formatDate(campaign.dueAt)}`
          : "Назначьте владельца и дедлайн ручного запуска.",
      done: Boolean(campaign.owner && campaign.dueAt),
      action: campaign.owner && campaign.dueAt ? "Готово" : "Назначить",
      href: "/marketing",
    },
    {
      title: "CRM-задача создана",
      description: campaign.crmTask
        ? `Задача: ${crmTaskStatusLabel(campaign.crmTask.status)}`
        : "Создайте задачу, чтобы запуск не потерялся в переписках.",
      done: Boolean(campaign.crmTask),
      action: campaign.crmTask ? "Открыть" : "Создать",
      href: "/guests/crm/tasks",
    },
    {
      title: "Первые контакты зафиксированы",
      description: firstContacts
        ? `${effect?.after.contacts ?? 0} контактов в кампании`
        : "После контакта запишите исход: дозвонились, обещал прийти, отказ.",
      done: firstContacts,
      action: firstContacts ? "Готово" : "Записать",
      href: "?tab=contacts#contacts",
    },
    {
      title: "Замер эффекта доступен",
      description: hasEffect
        ? "Есть визиты, деньги или клубной разрез после запуска."
        : "Эффект появится после визитов или связанных покупок гостей.",
      done: hasEffect,
      action: hasEffect ? "Смотреть" : "Ждать факты",
      href: "?tab=effect#effect",
    },
  ];
}

function ExecutionPromptList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <ul className="mt-2 space-y-2 text-sm leading-5 text-zinc-700 dark:text-zinc-200">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildExecutionPrompt(
  campaign: MarketingCampaign,
): ExecutionPrompt {
  const channel = normalizeChannel(campaign.channel);
  const audienceName = campaign.audience?.name ?? "выбранной группе";
  const mechanic = campaign.mechanic ?? "согласованному предложению";
  const owner = campaign.owner?.displayName ?? "ответственный не назначен";
  const due = formatDate(campaign.dueAt);
  const goal = campaignGoalLabel(campaign.goal);
  const preflight = [
    `Проверить группу: ${audienceName}.`,
    `Проверить согласия: доступно ${campaign.consentCoverage.contactable} из ${campaign.consentCoverage.targetTotal} гостей.`,
    `Ответственный: ${owner}; срок: ${due}.`,
  ];
  const factsToRecord = [
    "итог контакта: дозвонились, нет ответа, отказ, обещал прийти, нужна повторная связь",
    "комментарий администратора или менеджера",
    "следующий шаг и дата повторного контакта, если он нужен",
  ];

  if (channel.kind === "phone") {
    return {
      channel: channel.label,
      headline: "Звонок по группе гостей",
      primaryAction: "позвонить и зафиксировать итог в CRM",
      script: `Здравствуйте. Мы подготовили для вас предложение по теме "${goal}": ${mechanic}. Хотим пригласить вас в клуб и уточнить, удобно ли прийти в ближайшие дни. Если интересно, зафиксируем для администратора следующий шаг.`,
      preflight: [
        ...preflight,
        "Открыть CRM-задачу и идти по списку гостей без ручного копирования телефонов в сторонние файлы.",
      ],
      factsToRecord,
    };
  }

  if (channel.kind === "message") {
    return {
      channel: channel.label,
      headline: "Сообщение гостям с согласием",
      primaryAction: "отправить короткий текст и отметить результат",
      script: `Здравствуйте. Для вас есть предложение от клуба: ${mechanic}. Оно связано с "${goal}". Если хотите воспользоваться, ответьте на сообщение или сообщите администратору при визите.`,
      preflight: [
        ...preflight,
        "Отправлять только гостям с разрешенным контактом и не писать тем, кто отписался.",
      ],
      factsToRecord: [
        ...factsToRecord,
        "канал сообщения и факт ответа гостя",
      ],
    };
  }

  if (channel.kind === "club") {
    return {
      channel: channel.label,
      headline: "Инструкция администраторам в клубе",
      primaryAction: "передать оффер на смену и собрать ответы",
      script: `Если гость из группы "${audienceName}" пришел в клуб, предложите механику: ${mechanic}. Спросите, интересно ли воспользоваться сейчас или на следующем визите, и зафиксируйте ответ в CRM.`,
      preflight: [
        ...preflight,
        "Проверить, что администраторы понимают условия оффера и где отмечать результат.",
      ],
      factsToRecord: [
        ...factsToRecord,
        "клуб и смена, где гость получил предложение",
      ],
    };
  }

  return {
    channel: channel.label,
    headline: "Ручное исполнение через CRM",
    primaryAction: "выполнить задачу и записать факт контакта",
    script: `Работаем с группой "${audienceName}". Цель: ${goal}. Механика: ${mechanic}. После контакта обязательно сохранить результат, чтобы потом увидеть эффект по визитам, выручке, бару и загрузке.`,
    preflight,
    factsToRecord,
  };
}

function normalizeChannel(channel: string | null) {
  const value = (channel ?? "").trim();
  const lower = value.toLowerCase();

  if (
    lower.includes("звон") ||
    lower.includes("call") ||
    lower.includes("phone") ||
    lower.includes("тел")
  ) {
    return { kind: "phone", label: value || "Звонок" };
  }

  if (
    lower.includes("telegram") ||
    lower.includes("телег") ||
    lower.includes("max") ||
    lower.includes("sms") ||
    lower.includes("смс") ||
    lower.includes("сообщ")
  ) {
    return { kind: "message", label: value || "Сообщение" };
  }

  if (
    lower.includes("клуб") ||
    lower.includes("админ") ||
    lower.includes("смен") ||
    lower.includes("объяв")
  ) {
    return { kind: "club", label: value || "В клубе" };
  }

  return { kind: "crm", label: value || "CRM-задача" };
}

function campaignGoalLabel(goal: MarketingCampaign["goal"]) {
  const labels: Record<MarketingCampaign["goal"], string> = {
    RETURN_GUESTS: "вернуть гостей",
    REPEAT_VISIT: "получить повторный визит",
    WEAK_HOURS: "загрузить тихие часы",
    BAR_GROWTH: "увеличить бар",
    EVENT_PROMO: "пригласить на событие или бронь",
    PROMO_BUNDLE: "продать промо-набор",
  };

  return labels[goal];
}

function formatDate(value: string | null) {
  if (!value) {
    return "не задан";
  }

  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

function campaignStatusTransitions(
  status: MarketingCampaignStatus,
): StatusTransition[] {
  if (status === "DRAFT") {
    return [
      { label: "Запланировать", status: "PLANNED", tone: "primary" },
      { label: "Отменить", status: "CANCELED", tone: "danger" },
    ];
  }

  if (status === "PLANNED") {
    return [
      { label: "Начать работу", status: "RUNNING", tone: "primary" },
      { label: "Отменить", status: "CANCELED", tone: "danger" },
    ];
  }

  if (status === "RUNNING") {
    return [
      { label: "Завершить", status: "FINISHED", tone: "primary" },
      { label: "Отменить", status: "CANCELED", tone: "danger" },
    ];
  }

  if (status === "FINISHED") {
    return [
      { label: "Вернуть в работу", status: "RUNNING", tone: "secondary" },
    ];
  }

  return [
    { label: "Вернуть в работу", status: "RUNNING", tone: "secondary" },
  ];
}

function statusButtonClass(tone: StatusTransition["tone"]) {
  const base =
    "inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";

  if (tone === "primary") {
    return `${base} bg-emerald-500 text-zinc-950 hover:bg-emerald-400`;
  }

  if (tone === "danger") {
    return `${base} border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/50 dark:text-red-200 dark:hover:bg-red-500/10`;
  }

  return `${base} border border-zinc-300 text-zinc-700 hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-950`;
}

function crmTaskStatusLabel(status: string) {
  const labels: Record<string, string> = {
    OPEN: "новая",
    IN_PROGRESS: "в работе",
    DONE: "готово",
    CANCELED: "отменена",
  };

  return labels[status] ?? status.toLowerCase();
}

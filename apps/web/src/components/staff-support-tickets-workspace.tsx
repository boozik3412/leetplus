'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { StaffSupportTicket, StaffSupportTicketsReport, SupportTicketStatus, SupportTicketTopic } from '@/lib/staff-support-tickets';

const statusLabels: Record<SupportTicketStatus, string> = {
  NEW: 'Новое',
  IN_PROGRESS: 'В работе',
  RESOLVED: 'Решено',
  CLOSED: 'Закрыто',
};

const topicLabels: Record<SupportTicketTopic, string> = {
  GAME_MODULE: 'Игровой модуль',
  MISSIONS_AND_BATTLE_PASS: 'Задания и боевой пропуск',
  LOOT_BOXES_AND_REWARDS: 'Лутбоксы и награды',
  BALANCE_AND_PAYMENTS: 'Баланс и платежи',
  AUTH_AND_PROFILE: 'Авторизация и профиль',
  INTERFACE_AND_DISPLAY: 'Интерфейс и отображение',
  OTHER: 'Другое',
};

export function StaffSupportTicketsWorkspace({ report, canManage, apiBasePath }: { report: StaffSupportTicketsReport; canManage: boolean; apiBasePath: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  async function updateTicket(ticket: StaffSupportTicket, body: { status?: SupportTicketStatus; assignedToUserId?: string | null }) {
    setError(null);
    const response = await fetch(`${apiBasePath}/${encodeURIComponent(ticket.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? 'Не удалось обновить обращение.');
      return;
    }
    startTransition(() => router.refresh());
  }

  async function addComment(ticket: StaffSupportTicket) {
    const body = comments[ticket.id]?.trim() ?? '';
    if (!body) return;
    setError(null);
    const response = await fetch(`${apiBasePath}/${encodeURIComponent(ticket.id)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? 'Не удалось добавить комментарий.');
      return;
    }
    setComments((current) => ({ ...current, [ticket.id]: '' }));
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Активные" value={report.summary.active} tone="cyan" />
        <Metric label="Новые" value={report.summary.NEW} tone="amber" />
        <Metric label="В работе" value={report.summary.IN_PROGRESS} tone="cyan" />
        <Metric label="Решено" value={report.summary.RESOLVED} tone="emerald" />
        <Metric label="Всего" value={report.summary.total} tone="zinc" />
      </section>

      <form className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:grid-cols-3 xl:grid-cols-6">
        {report.scope === 'PLATFORM' ? <FilterSelect name="tenantId" label="Сеть" defaultValue={report.filters.tenantId ?? ''} options={[["", 'Все сети'], ...report.tenants.map((tenant) => [tenant.id, tenant.name] as const)]} /> : null}
        <FilterSelect name="status" label="Статус" defaultValue={report.filters.status} options={[['all', 'Все статусы'], ...report.statuses.map((value) => [value, statusLabels[value]] as const)]} />
        <FilterSelect name="topic" label="Тема" defaultValue={report.filters.topic} options={[['all', 'Все темы'], ...report.topics.map((value) => [value, topicLabels[value]] as const)]} />
        <FilterSelect name="assignedToUserId" label="Ответственный" defaultValue={report.filters.assignedToUserId ?? ''} options={[["", 'Все специалисты'], ...report.users.map((user) => [user.id, user.fullName ?? user.email] as const)]} />
        <label className="space-y-1 text-xs font-bold uppercase text-zinc-500">
          Поиск
          <input name="search" defaultValue={report.filters.search ?? ''} placeholder="Номер, описание, гость" className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium normal-case text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100" />
        </label>
        <button className="mt-auto h-10 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white dark:bg-emerald-400 dark:text-zinc-950">Показать</button>
      </form>

      {error ? <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}

      <section className="space-y-3">
        {report.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800">По выбранным фильтрам обращений нет.</div>
        ) : report.rows.map((ticket) => (
          <article key={ticket.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={ticket.status} />
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{topicLabels[ticket.topic]}</span>
                  <span className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-300">{ticket.ticketNumber}</span>
                </div>
                <h2 className="mt-3 text-lg font-semibold">{ticket.profile.displayName ?? ticket.profile.contactMasked ?? 'Гость игрового модуля'}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">{ticket.description}</p>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <Meta label="Сеть / клуб" value={`${ticket.tenant.name} · ${ticket.store.name}`} />
                  <Meta label="Создано" value={formatDateTime(ticket.createdAt)} />
                  <Meta label="Среда" value={[ticket.device, ticket.browser, ticket.viewport].filter(Boolean).join(' · ') || 'не определена'} />
                  <Meta label="Страница" value={ticket.route ?? 'не указана'} />
                </dl>
                {ticket.attachments.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {ticket.attachments.map((attachment) => (
                      <a key={attachment.id} href={`${apiBasePath}/${encodeURIComponent(ticket.id)}/attachments/${encodeURIComponent(attachment.id)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-500/15 dark:text-cyan-300">Скачать вложение · {formatBytes(attachment.byteSize)}</a>
                    ))}
                  </div>
                ) : null}
              </div>

              <aside className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <label className="block space-y-1 text-xs font-bold uppercase text-zinc-500">
                  Ответственный
                  <select disabled={!canManage || isPending} value={ticket.assignedToUserId ?? ''} onChange={(event) => updateTicket(ticket, { assignedToUserId: event.target.value || null })} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium normal-case dark:border-zinc-700 dark:bg-zinc-950">
                    <option value="">Не назначен</option>
                    {report.users.map((user) => <option key={user.id} value={user.id}>{user.fullName ?? user.email}</option>)}
                  </select>
                </label>
                <label className="block space-y-1 text-xs font-bold uppercase text-zinc-500">
                  Статус
                  <select disabled={!canManage || isPending} value={ticket.status} onChange={(event) => updateTicket(ticket, { status: event.target.value as SupportTicketStatus })} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium normal-case dark:border-zinc-700 dark:bg-zinc-950">
                    {report.statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                  </select>
                </label>
                <p className="text-xs text-zinc-500">Релиз: <span className="font-mono">{ticket.releaseSha?.slice(0, 12) ?? 'не определён'}</span></p>
              </aside>
            </div>

            <div className="border-t border-zinc-200 bg-zinc-50/70 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/30">
              {ticket.comments.length ? (
                <div className="mb-3 space-y-2">
                  {ticket.comments.map((comment) => <p key={comment.id} className="text-sm"><span className="font-semibold">{comment.authorUser?.fullName ?? comment.authorUser?.email ?? 'Система'}:</span> <span className="text-zinc-600 dark:text-zinc-300">{comment.body}</span> <time className="ml-2 text-xs text-zinc-400">{formatDateTime(comment.createdAt)}</time></p>)}
                </div>
              ) : null}
              {canManage ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input value={comments[ticket.id] ?? ''} onChange={(event) => setComments((current) => ({ ...current, [ticket.id]: event.target.value }))} maxLength={2000} placeholder="Добавить внутренний комментарий" className="h-10 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
                  <button type="button" disabled={isPending || !(comments[ticket.id]?.trim())} onClick={() => addComment(ticket)} className="h-10 rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Добавить</button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function FilterSelect({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: ReadonlyArray<readonly [string, string]> }) {
  return <label className="space-y-1 text-xs font-bold uppercase text-zinc-500">{label}<select name={name} defaultValue={defaultValue} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium normal-case text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">{options.map(([value, text]) => <option key={value || 'all'} value={value}>{text}</option>)}</select></label>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'cyan' | 'amber' | 'emerald' | 'zinc' }) {
  const tones = { cyan: 'text-cyan-600 dark:text-cyan-300', amber: 'text-amber-600 dark:text-amber-300', emerald: 'text-emerald-600 dark:text-emerald-300', zinc: 'text-zinc-900 dark:text-zinc-100' };
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"><p className="text-xs font-bold uppercase tracking-wide text-zinc-500">{label}</p><p className={`mt-2 text-3xl font-semibold ${tones[tone]}`}>{new Intl.NumberFormat('ru-RU').format(value)}</p></div>;
}

function StatusBadge({ status }: { status: SupportTicketStatus }) {
  const tones = status === 'NEW' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300' : status === 'IN_PROGRESS' ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : status === 'RESOLVED' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-500/10 text-zinc-500';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${tones}`}>{statusLabels[status]}</span>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="font-bold uppercase text-zinc-400">{label}</dt><dd className="mt-1 break-words text-zinc-600 dark:text-zinc-300">{value}</dd></div>; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} КБ` : `${(value / 1024 / 1024).toFixed(1)} МБ`; }

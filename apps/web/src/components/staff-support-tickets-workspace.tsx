'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition, type FormEvent } from 'react';
import {
  notifySupportQueueChanged,
  setDesktopNotices,
  useDesktopNoticeState,
} from '@/components/support-queue-watch';
import type { StaffSupportTicket, StaffSupportTicketsReport, SupportTicketCommentVisibility, SupportTicketGuestRewards, SupportTicketStatus, TicketUser } from '@/lib/staff-support-tickets';
import { supportTicketTopicLabels as topicLabels } from '@/lib/support-ticket-labels';

const statusLabels: Record<SupportTicketStatus, string> = {
  NEW: 'Новое',
  IN_PROGRESS: 'В работе',
  RESOLVED: 'Решено',
  CLOSED: 'Закрыто',
};

const hourMs = 60 * 60 * 1000;

type WorkspaceProps = {
  report: StaffSupportTicketsReport;
  canManage: boolean;
  apiBasePath: string;
  pagePath: string;
  currentUserId: string;
  now: string;
};

type ImagePreview = { src: string; label: string };
type ComposerMode = 'INTERNAL' | 'PUBLIC';

const guestAuthorLabel = 'Поддержка LeetPlus';
// Events written by the guest or by the system on the guest's behalf.
const guestActions = new Set(['CREATED_BY_GUEST', 'GUEST_MESSAGE_ADDED', 'GUEST_READ', 'GUEST_FEEDBACK', 'REOPENED_BY_GUEST']);

export function StaffSupportTicketsWorkspace({ report, canManage, apiBasePath, pagePath, currentUserId, now }: WorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [composerModes, setComposerModes] = useState<Record<string, ComposerMode>>({});
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const nowMs = new Date(now).getTime();
  const namesById = useMemo(() => collectUserNames(report), [report]);

  useEffect(() => {
    if (!preview) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreview(null);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [preview]);

  async function send(ticket: StaffSupportTicket, path: string, method: 'PATCH' | 'POST', body: unknown, fallbackError: string) {
    setError(null);
    setBusyTicketId(ticket.id);
    try {
      const response = await fetch(`${apiBasePath}/${encodeURIComponent(ticket.id)}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(`${ticket.ticketNumber}: ${payload?.message ?? fallbackError}`);
        return false;
      }
      notifySupportQueueChanged();
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError(`${ticket.ticketNumber}: ${fallbackError}`);
      return false;
    } finally {
      setBusyTicketId(null);
    }
  }

  function updateTicket(ticket: StaffSupportTicket, body: { status?: SupportTicketStatus; assignedToUserId?: string | null }) {
    return send(ticket, '', 'PATCH', body, 'Не удалось обновить обращение.');
  }

  async function addComment(event: FormEvent<HTMLFormElement>, ticket: StaffSupportTicket) {
    event.preventDefault();
    const body = comments[ticket.id]?.trim() ?? '';
    if (!body) return;
    const visibility = composerModes[ticket.id] ?? 'INTERNAL';
    const sent = await send(
      ticket,
      '/comments',
      'POST',
      { body, visibility },
      visibility === 'PUBLIC' ? 'Не удалось отправить ответ гостю.' : 'Не удалось добавить заметку.',
    );
    if (sent) {
      setComments((current) => ({ ...current, [ticket.id]: '' }));
    }
  }

  async function resolveWithReply(ticket: StaffSupportTicket) {
    const body = comments[ticket.id]?.trim() ?? '';
    if (!body) return;
    if (await send(ticket, '/resolve-with-reply', 'POST', { body }, 'Не удалось ответить и решить обращение.')) {
      setComments((current) => ({ ...current, [ticket.id]: '' }));
    }
  }

  const filterHref = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    if (report.scope === 'PLATFORM' && report.filters.tenantId) params.set('tenantId', report.filters.tenantId);
    Object.entries(patch).forEach(([key, value]) => params.set(key, value));
    return `${pagePath}?${params.toString()}`;
  };
  const isFilter = (status: string, assignee: string | null = null) =>
    report.filters.status === status && (report.filters.assignedToUserId ?? null) === assignee && !report.filters.search && report.filters.topic === 'all' && !report.filters.storeId;
  const oldestWaitMs = report.summary.oldestActiveCreatedAt ? nowMs - new Date(report.summary.oldestActiveCreatedAt).getTime() : null;

  return (
    <div className="space-y-5">
      <DesktopNoticeToggle />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <Metric label="В очереди" value={formatCount(report.summary.active)} tone="cyan" href={filterHref({ status: 'active' })} selected={isFilter('active')} />
        <Metric label="Новые, не взяты" value={formatCount(report.summary.NEW)} tone="amber" href={filterHref({ status: 'NEW' })} selected={isFilter('NEW')} />
        <Metric label="Без ответственного" value={formatCount(report.summary.unassigned)} tone="amber" href={filterHref({ status: 'active', assignedToUserId: 'none' })} selected={isFilter('active', 'none')} />
        <Metric label="Мои" value={formatCount(report.summary.mine)} tone="emerald" href={filterHref({ status: 'active', assignedToUserId: 'me' })} selected={isFilter('active', 'me')} />
        <Metric label="Ждут ответа" value={formatCount(report.summary.awaitingStaff ?? 0)} tone={report.summary.awaitingStaff ? 'red' : 'zinc'} href={filterHref({ status: 'awaiting' })} selected={isFilter('awaiting')} />
        <Metric label="Дольше всех ждёт" value={oldestWaitMs === null ? '—' : formatDuration(oldestWaitMs)} tone={waitTone(oldestWaitMs)} href={filterHref({ status: 'active' })} selected={false} />
        <Metric label="Всего" value={formatCount(report.summary.total)} tone="zinc" href={filterHref({ status: 'all' })} selected={isFilter('all')} />
      </section>

      <form className={`grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:grid-cols-3 ${report.scope === 'PLATFORM' ? 'xl:grid-cols-7' : 'xl:grid-cols-6'}`}>
        {report.scope === 'PLATFORM' ? <FilterSelect name="tenantId" label="Сеть" defaultValue={report.filters.tenantId ?? ''} options={[["", 'Все сети'], ...report.tenants.map((tenant) => [tenant.id, tenant.name] as const)]} /> : null}
        <FilterSelect name="status" label="Статус" defaultValue={report.filters.status} options={[['active', 'В очереди (новые и в работе)'], ['awaiting', 'Ждут ответа гостю'], ['all', 'Все статусы'], ...report.statuses.map((value) => [value, statusLabels[value]] as const)]} />
        <FilterSelect name="topic" label="Тема" defaultValue={report.filters.topic} options={[['all', 'Все темы'], ...report.topics.map((value) => [value, topicLabels[value]] as const)]} />
        <FilterSelect name="storeId" label="Клуб" defaultValue={report.filters.storeId ?? ''} options={[["", 'Все клубы'], ...(report.stores ?? []).map((store) => [store.id, `${store.name}${report.scope === 'PLATFORM' ? ` · ${store.tenantName}` : ''} (${store.tickets})`] as const)]} />
        <FilterSelect name="assignedToUserId" label="Ответственный" defaultValue={report.filters.assignedToUserId ?? ''} options={[["", 'Все'], ['none', 'Без ответственного'], ['me', 'Назначены на меня'], ...report.users.map((user) => [user.id, userLabel(user)] as const)]} />
        <label className="space-y-1 text-xs font-bold uppercase text-zinc-500">
          Поиск
          <input name="search" defaultValue={report.filters.search ?? ''} placeholder="Номер, описание, гость" className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium normal-case text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100" />
        </label>
        <div className="mt-auto flex gap-2">
          <button className="h-10 flex-1 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white dark:bg-emerald-400 dark:text-zinc-950">Показать</button>
          <Link href={pagePath} className="inline-flex h-10 items-center rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900">Сброс</Link>
        </div>
      </form>

      {isQueueFilter(report.filters.status) && report.rows.length > 1 ? (
        <p className="text-xs text-zinc-500">Сначала показаны обращения, которые ждут дольше всех.</p>
      ) : null}

      {error ? <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}

      <section className="space-y-3">
        {report.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
            {report.filters.status === 'active' && !report.filters.search ? 'Очередь пуста: все обращения обработаны.' : report.filters.status === 'awaiting' && !report.filters.search ? 'Все гости получили ответ.' : 'По выбранным фильтрам обращений нет.'}
          </div>
        ) : report.rows.map((ticket) => {
          const isBusy = isPending || busyTicketId === ticket.id;
          const assignees = assigneeOptions(ticket, report.users);
          const isOpen = ticket.status === 'NEW' || ticket.status === 'IN_PROGRESS';
          const canTake = canManage && isOpen && report.users.some((user) => user.id === currentUserId && isEligibleFor(user, ticket)) && !(ticket.assignedToUserId === currentUserId && ticket.status === 'IN_PROGRESS');
          const takeLabel = !canTake ? null : ticket.assignedToUserId && ticket.assignedToUserId !== currentUserId ? 'Забрать себе' : 'Взять в работу';

          return (
            <article key={ticket.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-950 ${ticket.status === 'NEW' ? 'border-amber-400/60 dark:border-amber-500/40' : 'border-zinc-200 dark:border-zinc-800'}`}>
              <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={ticket.status} />
                    <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300" title="Клуб обращения">{ticket.store.name}</span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{topicLabels[ticket.topic]}</span>
                    <span className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-300">{ticket.ticketNumber}</span>
                    <AgeBadge ticket={ticket} nowMs={nowMs} />
                    <GuestThreadBadges ticket={ticket} />
                  </div>
                  <h2 className="mt-3 text-lg font-semibold">{ticket.profile.fullName ?? ticket.profile.displayName ?? ticket.profile.contactMasked ?? 'Гость игрового модуля'}</h2>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-600 dark:text-zinc-300">{ticket.description}</p>
                  <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    <Meta label="ФИО гостя" value={ticket.profile.fullName ?? ticket.profile.displayName ?? 'не указано'} />
                    <Meta label="Телефон" value={formatPhone(ticket.profile.phone ?? ticket.profile.contactMasked)} />
                    <Meta label="Сеть / клуб" value={`${ticket.tenant.name} · ${ticket.store.name}`} />
                    {ticket.reportedFromStore ? <Meta label="Отправлено из клуба" value={`${ticket.reportedFromStore.name} — гость указал другой клуб`} /> : null}
                    <Meta label="Создано" value={formatDateTime(ticket.createdAt)} />
                    <Meta label="Последнее действие" value={formatDateTime(ticket.lastActivityAt)} />
                    {ticket.resolvedAt ? <Meta label="Решено" value={formatDateTime(ticket.resolvedAt)} /> : null}
                    {ticket.closedAt ? <Meta label="Закрыто" value={formatDateTime(ticket.closedAt)} /> : null}
                    <Meta label="Среда" value={[ticket.device, ticket.browser, ticket.viewport].filter(Boolean).join(' · ') || 'не определена'} />
                    <Meta label="Страница" value={ticket.route ?? 'не указана'} />
                  </dl>
                  <GuestRewardsPanel ticket={ticket} apiBasePath={apiBasePath} />
                  {ticket.attachments.length ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {ticket.attachments.map((attachment) => {
                        const src = `${apiBasePath}/${encodeURIComponent(ticket.id)}/attachments/${encodeURIComponent(attachment.id)}`;
                        const label = `${ticket.ticketNumber} · ${attachment.fileName}`;
                        return (
                          <figure key={attachment.id} className="w-44 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                            {attachment.contentType.startsWith('image/') ? (
                              <button type="button" onClick={() => setPreview({ src, label })} aria-label={`Открыть скриншот ${label}`} className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500">
                                {/* eslint-disable-next-line @next/next/no-img-element -- private attachment served by the support BFF */}
                                <img src={src} alt={`Скриншот к обращению ${ticket.ticketNumber}`} loading="lazy" className="h-28 w-full object-cover" />
                              </button>
                            ) : null}
                            <figcaption className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-zinc-500">
                              <span>{formatBytes(attachment.byteSize)}</span>
                              <a href={src} download className="font-semibold text-cyan-700 hover:underline dark:text-cyan-300">Скачать</a>
                            </figcaption>
                          </figure>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <aside className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                  {takeLabel ? (
                    <button type="button" disabled={isBusy} onClick={() => updateTicket(ticket, { status: 'IN_PROGRESS', assignedToUserId: currentUserId })} className="h-10 w-full rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50">
                      {busyTicketId === ticket.id ? 'Сохраняем…' : takeLabel}
                    </button>
                  ) : null}
                  <label className="block space-y-1 text-xs font-bold uppercase text-zinc-500">
                    Ответственный
                    <select disabled={!canManage || isBusy} value={ticket.assignedToUserId ?? ''} onChange={(event) => updateTicket(ticket, { assignedToUserId: event.target.value || null })} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium normal-case dark:border-zinc-700 dark:bg-zinc-950">
                      <option value="">Не назначен</option>
                      {assignees.map((user) => <option key={user.id} value={user.id}>{userLabel(user)}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1 text-xs font-bold uppercase text-zinc-500">
                    Статус
                    <select disabled={!canManage || isBusy} value={ticket.status} onChange={(event) => updateTicket(ticket, { status: event.target.value as SupportTicketStatus })} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium normal-case dark:border-zinc-700 dark:bg-zinc-950">
                      {report.statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                    </select>
                  </label>
                  <p className="text-xs text-zinc-500">Релиз: <span className="font-mono">{ticket.releaseSha?.slice(0, 12) ?? 'не определён'}</span></p>
                </aside>
              </div>

              <div className="border-t border-zinc-200 bg-zinc-50/70 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/30">
                {ticket.comments.length ? (
                  <div className="mb-3 space-y-2">
                    {ticket.comments.map((comment) => (
                      <p key={comment.id} className={`whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${commentTones[comment.visibility ?? 'INTERNAL']}`}>
                        <CommentBadge visibility={comment.visibility ?? 'INTERNAL'} />
                        <span className="font-semibold">{comment.visibility === 'GUEST' ? 'Гость' : comment.authorUser ? userLabel(comment.authorUser) : 'Система'}:</span>{' '}
                        <span className="text-zinc-600 dark:text-zinc-300">{comment.body}</span>
                        <time className="ml-2 text-xs text-zinc-400">{formatDateTime(comment.createdAt)}</time>
                      </p>
                    ))}
                  </div>
                ) : null}
                {canManage ? (
                  <TicketComposer
                    mode={composerModes[ticket.id] ?? 'INTERNAL'}
                    value={comments[ticket.id] ?? ''}
                    busy={isBusy}
                    canResolve={isOpen}
                    onModeChange={(mode) => setComposerModes((current) => ({ ...current, [ticket.id]: mode }))}
                    onChange={(value) => setComments((current) => ({ ...current, [ticket.id]: value }))}
                    onSubmit={(event) => addComment(event, ticket)}
                    onResolve={() => void resolveWithReply(ticket)}
                  />
                ) : null}
                <TicketHistory ticket={ticket} namesById={namesById} />
              </div>
            </article>
          );
        })}
      </section>

      {preview ? (
        <div role="dialog" aria-modal="true" aria-label={preview.label} className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button type="button" aria-label="Закрыть просмотр" onClick={() => setPreview(null)} className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" />
          <figure className="relative z-10 flex max-h-full max-w-5xl flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- private attachment served by the support BFF */}
            <img src={preview.src} alt={preview.label} className="max-h-[80vh] w-auto rounded-xl bg-white object-contain shadow-2xl" />
            <figcaption className="mt-3 flex w-full flex-wrap items-center justify-between gap-3 text-sm text-zinc-100">
              <span className="break-all">{preview.label}</span>
              <span className="flex gap-2">
                <a href={preview.src} download className="rounded-lg border border-white/30 px-3 py-1.5 font-semibold hover:bg-white/10">Скачать</a>
                <button type="button" autoFocus onClick={() => setPreview(null)} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-zinc-950">Закрыть</button>
              </span>
            </figcaption>
          </figure>
        </div>
      ) : null}
    </div>
  );
}

const commentTones: Record<SupportTicketCommentVisibility, string> = {
  INTERNAL: 'bg-transparent',
  PUBLIC: 'border border-cyan-500/30 bg-cyan-500/5',
  GUEST: 'border border-amber-500/30 bg-amber-500/5',
};

function CommentBadge({ visibility }: { visibility: SupportTicketCommentVisibility }) {
  const badge = {
    INTERNAL: ['Заметка', 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'],
    PUBLIC: ['Гостю', 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'],
    GUEST: ['От гостя', 'bg-amber-500/15 text-amber-700 dark:text-amber-300'],
  }[visibility];
  return <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge[1]}`}>{badge[0]}</span>;
}

function GuestThreadBadges({ ticket }: { ticket: StaffSupportTicket }) {
  const thread = ticket.guestThread;
  if (!thread) return null;
  const badges: Array<[string, string]> = [];
  if (thread.awaitingStaff && (ticket.status === 'NEW' || ticket.status === 'IN_PROGRESS')) {
    badges.push(['Ждёт ответа', 'bg-red-500/10 text-red-600 dark:text-red-300']);
  }
  if (thread.feedback) {
    badges.push(
      thread.feedback.value === 'HELPED'
        ? ['Гость: помогло', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300']
        : ['Гость: не помогло', 'bg-red-500/10 text-red-600 dark:text-red-300'],
    );
  }
  if (thread.lastPublicReplyAt) {
    badges.push([thread.unreadByGuest ? 'Ответ не прочитан' : 'Ответ прочитан', 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400']);
  }
  return (
    <>
      {badges.map(([label, tone]) => (
        <span key={label} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>
      ))}
    </>
  );
}

function TicketComposer({
  mode,
  value,
  busy,
  canResolve,
  onModeChange,
  onChange,
  onSubmit,
  onResolve,
}: {
  mode: ComposerMode;
  value: string;
  busy: boolean;
  canResolve: boolean;
  onModeChange: (mode: ComposerMode) => void;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResolve: () => void;
}) {
  const empty = !value.trim();
  const tab = (target: ComposerMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === target}
      onClick={() => onModeChange(target)}
      className={`h-8 rounded-md px-3 text-xs font-semibold transition ${mode === target ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
    >
      {label}
    </button>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="inline-flex rounded-lg bg-zinc-200/70 p-1 dark:bg-zinc-900">
        {tab('INTERNAL', 'Заметка для команды')}
        {tab('PUBLIC', 'Ответ гостю')}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={2000}
        rows={mode === 'PUBLIC' ? 3 : 2}
        placeholder={mode === 'PUBLIC' ? 'Ответ гостю: что случилось и что мы сделали' : 'Внутренняя заметка: что проверили, что решили'}
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm dark:bg-zinc-950 ${mode === 'PUBLIC' ? 'border-cyan-500/50' : 'border-zinc-200 dark:border-zinc-700'}`}
      />
      {mode === 'PUBLIC' ? (
        <p className="text-xs text-cyan-700 dark:text-cyan-300">Гость увидит ответ в игровом модуле от имени «{guestAuthorLabel}». Имя сотрудника не показывается.</p>
      ) : (
        <p className="text-xs text-zinc-500">Заметку видят только сотрудники.</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {mode === 'PUBLIC' && canResolve ? (
          <button type="button" disabled={busy || empty} onClick={onResolve} className="h-10 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-50">
            Ответить и решить
          </button>
        ) : null}
        <button type="submit" disabled={busy || empty} className="h-10 rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {mode === 'PUBLIC' ? 'Отправить гостю' : 'Добавить заметку'}
        </button>
      </div>
    </form>
  );
}

// Lazily loads what the guest received in the ticket's club, so a "the case
// was not given" report can be checked right in the card.
function GuestRewardsPanel({ ticket, apiBasePath }: { ticket: StaffSupportTicket; apiBasePath: string }) {
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'error'; data: SupportTicketGuestRewards | null }>({ status: 'idle', data: null });

  async function load() {
    if (state.status === 'loading' || state.data) return;
    setState({ status: 'loading', data: null });
    try {
      const response = await fetch(`${apiBasePath}/${encodeURIComponent(ticket.id)}/guest-rewards`, { cache: 'no-store' });
      if (!response.ok) throw new Error('load failed');
      setState({ status: 'idle', data: (await response.json()) as SupportTicketGuestRewards });
    } catch {
      setState({ status: 'error', data: null });
    }
  }

  const data = state.data;
  const tones = { DONE: 'bg-emerald-500', WAITING: 'bg-amber-500', PROBLEM: 'bg-red-500' } as const;
  return (
    <details className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/60 text-sm dark:border-zinc-800 dark:bg-zinc-900/40" onToggle={(event) => { if ((event.currentTarget as HTMLDetailsElement).open) void load(); }}>
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold uppercase text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        Награды гостя в клубе «{ticket.store.name}» · 30 дней до обращения и после
      </summary>
      <div className="space-y-2 px-3 pb-3">
        {state.status === 'loading' ? <p className="text-xs text-zinc-500">Загружаем…</p> : null}
        {state.status === 'error' ? (
          <p className="text-xs text-red-600 dark:text-red-300">
            Не удалось загрузить награды.{' '}
            <button type="button" className="font-semibold underline" onClick={() => void load()}>Повторить</button>
          </p>
        ) : null}
        {data ? (
          <>
            {data.items.length === 0 ? (
              <p className="text-xs text-zinc-500">В этом клубе за период наград не было.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {data.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
                    <span className={`h-2 w-2 shrink-0 self-center rounded-full ${tones[item.state]}`} aria-hidden="true" />
                    <span className="font-semibold">{item.title}</span>
                    <span className="text-zinc-500">{item.rewardLabel} · {item.sourceLabel}</span>
                    <span className="text-zinc-700 dark:text-zinc-200">— {item.stateLabel}{item.payout ? `; ${item.payout.amount} бонусов: ${item.payout.statusLabel}` : ''}</span>
                    <time className="ml-auto text-xs text-zinc-400">{formatDateTime(item.createdAt)}</time>
                  </li>
                ))}
              </ul>
            )}
            {data.truncated ? <p className="text-xs text-zinc-500">Показаны последние {data.items.length}.</p> : null}
            {data.otherClubs.length || data.withoutClub ? (
              <p className="text-xs text-zinc-500">
                За этот период в других клубах сети:{' '}
                {[...data.otherClubs.map((club) => `${club.name} — ${club.items}`), ...(data.withoutClub ? [`без клуба — ${data.withoutClub}`] : [])].join(', ')}.
                {' '}Если гость говорит о другом клубе, проверьте его.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </details>
  );
}

function DesktopNoticeToggle() {
  const state = useDesktopNoticeState();
  if (state === 'unsupported') return null;
  const text =
    state === 'on'
      ? 'Уведомления браузера о новых обращениях включены. Они приходят, пока LeetPlus открыт хотя бы в одной вкладке.'
      : state === 'denied'
        ? 'Браузер запретил уведомления для LeetPlus. Разрешите их в настройках сайта, чтобы узнавать о новых обращениях.'
        : 'Включите уведомления браузера, чтобы узнавать о новых обращениях, пока LeetPlus открыт в любой вкладке.';
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 sm:flex-row sm:items-center sm:justify-between">
      <p className="min-w-0 sm:flex-1">{text}</p>
      {state === 'denied' ? null : (
        <button type="button" onClick={() => void setDesktopNotices(state !== 'on')} className={state === 'on' ? 'h-9 shrink-0 self-start rounded-lg border border-zinc-200 px-3 font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900' : 'h-9 shrink-0 self-start rounded-lg bg-cyan-600 px-3 font-semibold text-white hover:bg-cyan-500 sm:self-auto'}>
          {state === 'on' ? 'Выключить' : 'Включить уведомления'}
        </button>
      )}
    </div>
  );
}

function TicketHistory({ ticket, namesById }: { ticket: StaffSupportTicket; namesById: Map<string, string> }) {
  if (!ticket.auditEvents.length) return null;
  const events = [...ticket.auditEvents]
    .reverse()
    // A guest reply is shown once, by its PUBLIC_REPLY_SENT event.
    .filter((event) => !(event.action === 'COMMENT_ADDED' && isPublicComment(event.metadata)));
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer select-none text-xs font-bold uppercase text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">История · {events.length}{events.length >= 20 ? ' последних' : ''}</summary>
      <ol className="mt-2 space-y-1.5 border-l border-zinc-200 pl-3 dark:border-zinc-800">
        {events.map((event) => {
          const entry = describeAuditEvent(event, namesById);
          return (
            <li key={event.id} className="text-xs leading-5 text-zinc-600 dark:text-zinc-300">
              <time className="text-zinc-400">{formatDateTime(event.createdAt)}</time>
              <span className="mx-1.5 font-semibold text-zinc-800 dark:text-zinc-100">{entry.actor}</span>
              {entry.text}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

function describeAuditEvent(event: StaffSupportTicket['auditEvents'][number], namesById: Map<string, string>) {
  const metadata = event.metadata && typeof event.metadata === 'object' ? (event.metadata as Record<string, unknown>) : {};
  const actor = event.actorUser
    ? `${userLabel(event.actorUser)}${metadata.platformScope === true ? ' (LeetPlus)' : ''}`
    : guestActions.has(event.action) ? 'Гость' : 'Система';
  const nameOf = (value: unknown) => (typeof value === 'string' ? namesById.get(value) ?? 'сотрудник' : 'не назначен');

  switch (event.action) {
    case 'CREATED_BY_GUEST':
      return { actor, text: metadata.hasAttachment === true ? 'обращение отправлено со скриншотом' : 'обращение отправлено' };
    case 'COMMENT_ADDED':
      return { actor, text: 'добавлена заметка' };
    case 'PUBLIC_REPLY_SENT':
      return { actor, text: 'ответил гостю' };
    case 'GUEST_MESSAGE_ADDED':
      return { actor, text: 'написал в обращение' };
    case 'GUEST_READ':
      return { actor, text: 'прочитал ответ' };
    case 'GUEST_FEEDBACK':
      return { actor, text: metadata.value === 'HELPED' ? 'отметил, что ответ помог' : 'отметил, что ответ не помог' };
    case 'REOPENED_BY_GUEST':
      return { actor, text: 'обращение снова открыто' };
    case 'AUTO_CLOSED':
      return { actor, text: 'закрыто автоматически: гость не ответил 7 дней после решения' };
    case 'CLOSED_WITH_COMMENT':
      return { actor, text: 'закрыто с комментарием' };
    case 'UPDATED_BY_SUPPORT': {
      const parts: string[] = [];
      if (isStatus(metadata.previousStatus) && isStatus(metadata.status) && metadata.previousStatus !== metadata.status) {
        parts.push(`статус: ${statusLabels[metadata.previousStatus]} → ${statusLabels[metadata.status]}`);
      }
      if ((metadata.previousAssignedToUserId ?? null) !== (metadata.assignedToUserId ?? null)) {
        parts.push(`ответственный: ${nameOf(metadata.previousAssignedToUserId)} → ${nameOf(metadata.assignedToUserId)}`);
      }
      return { actor, text: parts.join('; ') || 'сохранено без изменений' };
    }
    default:
      return { actor, text: event.action };
  }
}

function collectUserNames(report: StaffSupportTicketsReport) {
  const names = new Map<string, string>();
  const add = (user: TicketUser | null | undefined) => {
    if (user) names.set(user.id, userLabel(user));
  };
  report.users.forEach(add);
  report.rows.forEach((ticket) => {
    add(ticket.assignedTo);
    ticket.comments.forEach((comment) => add(comment.authorUser));
    ticket.auditEvents.forEach((event) => add(event.actorUser));
  });
  return names;
}

function isEligibleFor(user: TicketUser, ticket: StaffSupportTicket) {
  return Boolean(user.isPlatformAdmin) || !user.tenantId || user.tenantId === ticket.tenant.id;
}

// Specialists of the ticket's own network plus LeetPlus admins; the current
// assignee stays visible even when the list on this page does not include them.
function assigneeOptions(ticket: StaffSupportTicket, users: TicketUser[]) {
  const options = users.filter((user) => isEligibleFor(user, ticket));
  if (ticket.assignedTo && !options.some((user) => user.id === ticket.assignedTo?.id)) {
    options.unshift(ticket.assignedTo);
  }
  return options;
}

function userLabel(user: TicketUser) {
  return `${user.fullName ?? user.email}${user.isPlatformAdmin ? ' · LeetPlus' : ''}`;
}

function isStatus(value: unknown): value is SupportTicketStatus {
  return typeof value === 'string' && value in statusLabels;
}

function isQueueFilter(status: string) {
  return status === 'active' || status === 'awaiting' || status === 'NEW' || status === 'IN_PROGRESS';
}

function isPublicComment(metadata: unknown) {
  return Boolean(metadata && typeof metadata === 'object' && (metadata as Record<string, unknown>).visibility === 'PUBLIC');
}

function AgeBadge({ ticket, nowMs }: { ticket: StaffSupportTicket; nowMs: number }) {
  const createdMs = new Date(ticket.createdAt).getTime();
  if (ticket.status === 'NEW' || ticket.status === 'IN_PROGRESS') {
    const waitMs = nowMs - createdMs;
    const tones = { zinc: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300', cyan: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300', amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', red: 'bg-red-500/10 text-red-600 dark:text-red-300', emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' };
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tones[waitTone(waitMs)]}`}>ждёт {formatDuration(waitMs)}</span>;
  }
  const doneAt = ticket.resolvedAt ?? ticket.closedAt;
  if (!doneAt) return null;
  return <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-900">обработано за {formatDuration(new Date(doneAt).getTime() - createdMs)}</span>;
}

function waitTone(waitMs: number | null): 'cyan' | 'amber' | 'red' | 'zinc' {
  if (waitMs === null) return 'zinc';
  if (waitMs >= 72 * hourMs) return 'red';
  if (waitMs >= 24 * hourMs) return 'amber';
  return 'cyan';
}

function FilterSelect({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: ReadonlyArray<readonly [string, string]> }) {
  return <label className="space-y-1 text-xs font-bold uppercase text-zinc-500">{label}<select name={name} defaultValue={defaultValue} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium normal-case text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">{options.map(([value, text]) => <option key={value || 'all'} value={value}>{text}</option>)}</select></label>;
}

function Metric({ label, value, tone, href, selected }: { label: string; value: string; tone: 'cyan' | 'amber' | 'emerald' | 'red' | 'zinc'; href: string; selected: boolean }) {
  const tones = { cyan: 'text-cyan-600 dark:text-cyan-300', amber: 'text-amber-600 dark:text-amber-300', emerald: 'text-emerald-600 dark:text-emerald-300', red: 'text-red-600 dark:text-red-300', zinc: 'text-zinc-900 dark:text-zinc-100' };
  return (
    <Link href={href} aria-current={selected ? 'true' : undefined} className={`rounded-2xl border bg-white p-3 transition sm:p-4 hover:border-zinc-400 dark:bg-zinc-950 dark:hover:border-zinc-600 ${selected ? 'border-zinc-900 ring-1 ring-zinc-900 dark:border-emerald-400 dark:ring-emerald-400' : 'border-zinc-200 dark:border-zinc-800'}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 sm:text-xs">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold sm:mt-2 sm:text-3xl ${tones[tone]}`}>{value}</p>
    </Link>
  );
}

function StatusBadge({ status }: { status: SupportTicketStatus }) {
  const tones = status === 'NEW' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300' : status === 'IN_PROGRESS' ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' : status === 'RESOLVED' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-500/10 text-zinc-500';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${tones}`}>{statusLabels[status]}</span>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="font-bold uppercase text-zinc-400">{label}</dt><dd className="mt-1 break-words text-zinc-600 dark:text-zinc-300">{value}</dd></div>; }
function formatCount(value: number) { return new Intl.NumberFormat('ru-RU').format(value); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} КБ` : `${(value / 1024 / 1024).toFixed(1)} МБ`; }
function formatDuration(ms: number) {
  const hours = Math.floor(Math.max(0, ms) / hourMs);
  if (hours < 1) return 'меньше часа';
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} дн. ${rest} ч` : `${days} дн.`;
}
function formatPhone(value: string | null) {
  if (!value) return 'не указан';
  if (value.includes('*')) return value;
  const digits = value.replace(/\D/g, '');
  const normalized = digits.length === 10 ? `7${digits}` : digits;
  if (normalized.length !== 11 || !/^[78]/.test(normalized)) return value;
  return `+7 (${normalized.slice(1, 4)}) ${normalized.slice(4, 7)}-${normalized.slice(7, 9)}-${normalized.slice(9)}`;
}

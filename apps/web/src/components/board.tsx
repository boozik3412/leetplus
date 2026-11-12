"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { groupIntoColumns, type BoardColumn } from "@/lib/board";

type Props<T, K extends string> = {
  /** Read by screen readers, e.g. «Задачи по статусам». */
  ariaLabel: string;
  columns: readonly BoardColumn<K>[];
  items: readonly T[];
  idOf: (item: T) => string;
  columnOf: (item: T) => K;
  /** Card body. The board draws the card frame and makes it a button. */
  renderCard: (item: T) => ReactNode;
  /** Opens the record, usually in a SidePanel. This is also the keyboard and
   * touch way to change the column: drag and drop is a mouse shortcut. */
  onOpen: (item: T) => void;
  /** Without it cards cannot be dragged (no rights or a read-only board). */
  onMove?: (item: T, to: K) => void;
  emptyText?: (column: BoardColumn<K>) => string;
  /** Ids that are being saved: their cards are dimmed and not draggable. */
  pendingIds?: ReadonlySet<string>;
};

const toneDot: Record<NonNullable<BoardColumn<string>["tone"]>, string> = {
  neutral: "bg-amber-500",
  progress: "bg-sky-500",
  success: "bg-emerald-500",
  muted: "bg-zinc-400",
};

const DRAG_TYPE = "application/x-leetplus-board-item";

/**
 * Columns with cards («канбан»). Shared by CRM, staff tasks and checklists.
 * On phones the columns scroll sideways inside the board, never the page.
 */
export function Board<T, K extends string>({
  ariaLabel,
  columns,
  items,
  idOf,
  columnOf,
  renderCard,
  onOpen,
  onMove,
  emptyText,
  pendingIds,
}: Props<T, K>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<K | null>(null);
  const groups = groupIntoColumns(items, columns, columnOf);
  const byId = new Map(items.map((item) => [idOf(item), item]));

  function drop(to: K, id: string | null) {
    setDraggingId(null);
    setOverColumn(null);
    const item = id ? byId.get(id) : undefined;
    if (!item || !onMove || columnOf(item) === to) return;
    onMove(item, to);
  }

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      style={{ "--board-columns": columns.length } as CSSProperties}
      className="grid snap-x snap-mandatory auto-cols-[minmax(17rem,85%)] grid-flow-col gap-3 overflow-x-auto pb-2 sm:auto-cols-[minmax(17rem,1fr)] xl:grid-flow-row xl:grid-cols-[repeat(var(--board-columns),minmax(0,1fr))] xl:overflow-visible"
    >
      {columns.map((column) => {
        const cards = groups.get(column.key) ?? [];
        const isOver = overColumn === column.key && draggingId !== null;

        return (
          <section
            key={column.key}
            aria-label={`${column.label}: ${cards.length}`}
            onDragOver={(event) => {
              if (!onMove || !event.dataTransfer.types.includes(DRAG_TYPE))
                return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (overColumn !== column.key) setOverColumn(column.key);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setOverColumn(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              drop(column.key, event.dataTransfer.getData(DRAG_TYPE) || null);
            }}
            className={`flex min-h-48 snap-start flex-col rounded-lg border p-2 transition-colors ${
              isOver
                ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/60 dark:bg-emerald-500/10"
                : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50"
            }`}
          >
            <header className="flex items-baseline justify-between gap-2 px-2 pt-1 pb-2">
              <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-full ${toneDot[column.tone ?? "neutral"]}`}
                />
                {column.label}
              </h3>
              <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                {cards.length}
              </span>
            </header>
            {column.hint ? (
              <p className="px-2 pb-2 text-xs text-zinc-500 dark:text-zinc-400">
                {column.hint}
              </p>
            ) : null}

            {cards.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {cards.map((item) => {
                  const id = idOf(item);
                  const pending = pendingIds?.has(id) ?? false;
                  const draggable = Boolean(onMove) && !pending;

                  return (
                    <li key={id}>
                      <button
                        type="button"
                        draggable={draggable}
                        onDragStart={(event) => {
                          event.dataTransfer.setData(DRAG_TYPE, id);
                          event.dataTransfer.effectAllowed = "move";
                          setDraggingId(id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setOverColumn(null);
                        }}
                        onClick={() => onOpen(item)}
                        aria-busy={pending || undefined}
                        className={`block w-full cursor-pointer rounded-md border border-zinc-200 bg-white p-3 text-left text-sm shadow-sm transition hover:border-zinc-300 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 ${
                          draggable ? "active:cursor-grabbing" : ""
                        } ${draggingId === id || pending ? "opacity-50" : ""}`}
                      >
                        {renderCard(item)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="m-1 rounded-md border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                {emptyText ? emptyText(column) : "Пусто"}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

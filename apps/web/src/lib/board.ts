/**
 * Pure helpers for the shared board (columns + cards). The board is used for
 * CRM tasks first, then CRM leads, staff tasks and checklists, so nothing here
 * knows about a particular entity: callers say which column an item is in and
 * how to put it into another one.
 */
export type BoardColumn<K extends string> = {
  key: K;
  label: string;
  /** One short line under the column title, e.g. what «Готово» keeps. */
  hint?: string;
  tone?: "neutral" | "progress" | "success" | "muted";
};

export function groupIntoColumns<T, K extends string>(
  items: readonly T[],
  columns: readonly BoardColumn<K>[],
  columnOf: (item: T) => K,
): Map<K, T[]> {
  const groups = new Map<K, T[]>();

  for (const column of columns) groups.set(column.key, []);

  for (const item of items) {
    const bucket = groups.get(columnOf(item));
    // Items whose column is not on the board (e.g. a status the board hides)
    // are left out rather than shown in the wrong place.
    if (bucket) bucket.push(item);
  }

  return groups;
}

/**
 * Returns a new list where the item with `id` is in column `to`. The item keeps
 * its place in the list, so a column's order stays stable after a move. Returns
 * the same array when nothing changes.
 */
export function moveToColumn<T, K extends string>(
  items: readonly T[],
  id: string,
  to: K,
  idOf: (item: T) => string,
  columnOf: (item: T) => K,
  withColumn: (item: T, column: K) => T,
): readonly T[] {
  const index = items.findIndex((item) => idOf(item) === id);

  if (index === -1 || columnOf(items[index]) === to) return items;

  const next = items.slice();
  next[index] = withColumn(items[index], to);

  return next;
}

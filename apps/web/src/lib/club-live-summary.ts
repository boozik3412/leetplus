// What the «Сейчас в клубах» banner on «Сводка» reads from the live view of a
// club (GET /api/stores/:id/floor-plan/live). No runtime imports so the
// node:test suite can load it directly.

export type ClubLiveState = {
  /** LIVE: Langame answered; OFF: not connected or no answer. */
  status: "LIVE" | "OFF";
  busy: number;
  total: number;
  guests: number | null;
};

export function clubLiveState(body: unknown): ClubLiveState {
  const view =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const pcs = Array.isArray(view.pcs) ? view.pcs : [];
  const busy = pcs.filter(
    (pc) =>
      pc && typeof pc === "object" && (pc as { busy?: unknown }).busy === true,
  ).length;
  const guests =
    typeof view.guests === "number" && Number.isFinite(view.guests)
      ? view.guests
      : null;
  return {
    status: view.status === "LIVE" && pcs.length > 0 ? "LIVE" : "OFF",
    busy,
    total: pcs.length,
    guests,
  };
}

/**
 * Network totals over the clubs Langame answered for. Guests are summed only
 * when every such club reported them, so a partial sum never reads as the
 * whole network.
 */
export function clubLiveTotals(states: readonly ClubLiveState[]) {
  const live = states.filter((state) => state.status === "LIVE");
  return {
    clubs: live.length,
    busy: live.reduce((sum, state) => sum + state.busy, 0),
    total: live.reduce((sum, state) => sum + state.total, 0),
    guests:
      live.length > 0 && live.every((state) => state.guests !== null)
        ? live.reduce((sum, state) => sum + (state.guests ?? 0), 0)
        : null,
  };
}

export function guestsLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} гость`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} гостя`;
  }
  return `${count} гостей`;
}

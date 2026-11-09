/**
 * Pure rules of the FACEIT match journal: which FACEIT CS2 match is eligible,
 * which club session it belongs to, and the facts stored for missions.
 * No I/O here; the worker service fetches and persists.
 */

export const FACEIT_SESSION_SLACK_MS = 5 * 60 * 1000;
export const FACEIT_MIN_MATCH_MS = 15 * 60 * 1000;
export const FACEIT_DAILY_COUNTED_CAP = 10;
/** An open club session older than this is not trusted as "still playing". */
export const FACEIT_OPEN_SESSION_MAX_MS = 24 * 60 * 60 * 1000;

export type FaceitHistoryItem = {
  matchId: string;
  status: string | null;
  gameMode: string | null;
  competitionType: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type FaceitPlayerMatchStats = {
  playerId: string;
  teamId: string;
  result: 'WIN' | 'LOSS' | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kd: number | null;
  adr: number | null;
  hsPercent: number | null;
  mvps: number | null;
  aces: number | null;
};

export type FaceitMatchStats = {
  map: string | null;
  players: FaceitPlayerMatchStats[];
};

export type ClubSessionWindow = {
  externalSessionId: string;
  externalDomain: string | null;
  storeId: string | null;
  startedAt: Date | null;
  stoppedAt: Date | null;
};

export type FaceitJournalDecision =
  | 'COUNTED'
  | 'OUTSIDE_SESSION'
  | 'NOT_ELIGIBLE'
  | 'REVIEW';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, max = 128) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function statNumber(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value.replace(',', '.'))
        : NaN;
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function unixDate(value: unknown) {
  const seconds = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : null;
}

export function parseFaceitHistory(body: unknown): FaceitHistoryItem[] {
  const items = record(body).items;

  return (Array.isArray(items) ? items : []).flatMap((row) => {
    const item = record(row);
    const matchId = text(item.match_id);
    if (!matchId) return [];
    return [
      {
        matchId,
        status: text(item.status)?.toUpperCase() ?? null,
        gameMode: text(item.game_mode)?.toLowerCase() ?? null,
        competitionType: text(item.competition_type)?.toLowerCase() ?? null,
        startedAt: unixDate(item.started_at),
        finishedAt: unixDate(item.finished_at),
      },
    ];
  });
}

export function parseFaceitMatchStats(body: unknown): FaceitMatchStats | null {
  const rounds = record(body).rounds;
  const round = record(Array.isArray(rounds) ? rounds[0] : null);
  const teams = round.teams;
  if (!Array.isArray(teams) || teams.length === 0) return null;
  const roundStats = record(round.round_stats);
  const players: FaceitPlayerMatchStats[] = [];

  for (const teamRow of teams) {
    const team = record(teamRow);
    const teamId = text(team.team_id) ?? '';
    const teamPlayers = team.players;
    for (const playerRow of Array.isArray(teamPlayers) ? teamPlayers : []) {
      const player = record(playerRow);
      const playerId = text(player.player_id);
      if (!playerId) continue;
      const stats = record(player.player_stats);
      const result = text(stats.Result);
      players.push({
        playerId,
        teamId,
        result: result === '1' ? 'WIN' : result === '0' ? 'LOSS' : null,
        kills: statNumber(stats.Kills),
        deaths: statNumber(stats.Deaths),
        assists: statNumber(stats.Assists),
        kd: statNumber(stats['K/D Ratio']),
        adr: statNumber(stats.ADR),
        hsPercent: statNumber(stats['Headshots %']),
        mvps: statNumber(stats.MVPs),
        aces: statNumber(stats['Penta Kills']),
      });
    }
  }

  return { map: text(roundStats.Map, 64), players };
}

/** Only finished 5×5 FACEIT matchmaking matches of a real length count. */
export function faceitMatchEligibility(item: FaceitHistoryItem) {
  if (item.status !== 'FINISHED') return 'NOT_FINISHED';
  if (item.gameMode !== '5v5') return 'NOT_5V5';
  if (item.competitionType !== 'matchmaking') return 'NOT_MATCHMAKING';
  if (!item.startedAt || !item.finishedAt) return 'NO_TIMES';
  if (
    item.finishedAt.getTime() - item.startedAt.getTime() <
    FACEIT_MIN_MATCH_MS
  ) {
    return 'TOO_SHORT';
  }
  return null;
}

/**
 * The paid club session that holds the whole match (with a small slack for
 * clock drift). An open session counts only while it is recent.
 */
export function sessionForMatch(
  sessions: readonly ClubSessionWindow[],
  startedAt: Date,
  finishedAt: Date,
  now: Date,
): ClubSessionWindow | null {
  return (
    sessions.find((session) => {
      if (!session.startedAt) return false;
      if (
        session.startedAt.getTime() - FACEIT_SESSION_SLACK_MS >
        startedAt.getTime()
      ) {
        return false;
      }
      if (session.stoppedAt) {
        return (
          session.stoppedAt.getTime() + FACEIT_SESSION_SLACK_MS >=
          finishedAt.getTime()
        );
      }
      return (
        now.getTime() - session.startedAt.getTime() <=
        FACEIT_OPEN_SESSION_MAX_MS
      );
    }) ?? null
  );
}

/**
 * Two linked guests of the same network on opposite teams can trade wins, so
 * such a match waits for staff review.
 */
export function opposingLinkedPlayers(
  stats: FaceitMatchStats,
  playerId: string,
  linkedPlayerIds: ReadonlySet<string>,
) {
  const self = stats.players.find((player) => player.playerId === playerId);
  if (!self) return [];
  return stats.players
    .filter(
      (player) =>
        player.playerId !== playerId &&
        player.teamId !== self.teamId &&
        linkedPlayerIds.has(player.playerId),
    )
    .map((player) => player.playerId);
}

export function faceitMissionFacts(stats: FaceitMatchStats, playerId: string) {
  const player = stats.players.find((row) => row.playerId === playerId);
  if (!player) return null;
  return {
    provider: 'FACEIT' as const,
    game: 'cs2' as const,
    result: player.result,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    kd: player.kd,
    adr: player.adr,
    hsPercent: player.hsPercent,
    mvps: player.mvps,
    aces: player.aces,
    map: stats.map,
  };
}

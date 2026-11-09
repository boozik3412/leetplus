import {
  FACEIT_OPEN_SESSION_MAX_MS,
  FACEIT_SESSION_SLACK_MS,
  faceitMatchEligibility,
  faceitMissionFacts,
  opposingLinkedPlayers,
  parseFaceitHistory,
  parseFaceitMatchStats,
  sessionForMatch,
  type ClubSessionWindow,
  type FaceitHistoryItem,
} from './faceit-match-journal';

const START = new Date('2026-11-09T15:00:00Z');
const FINISH = new Date('2026-11-09T15:40:00Z');

function item(overrides: Partial<FaceitHistoryItem> = {}): FaceitHistoryItem {
  return {
    matchId: '1-abc',
    status: 'FINISHED',
    gameMode: '5v5',
    competitionType: 'matchmaking',
    startedAt: START,
    finishedAt: FINISH,
    ...overrides,
  };
}

function session(
  overrides: Partial<ClubSessionWindow> = {},
): ClubSessionWindow {
  return {
    externalSessionId: 's-1',
    externalDomain: 'club.langame.ru',
    storeId: 'store-1',
    startedAt: new Date('2026-11-09T14:30:00Z'),
    stoppedAt: new Date('2026-11-09T16:00:00Z'),
    ...overrides,
  };
}

function faceitStatsBody() {
  return {
    rounds: [
      {
        round_stats: { Map: 'de_mirage' },
        teams: [
          {
            team_id: 'team-a',
            players: [
              {
                player_id: 'me',
                player_stats: {
                  Result: '1',
                  Kills: '24',
                  Deaths: '15',
                  Assists: '5',
                  'K/D Ratio': '1.6',
                  ADR: '92,4',
                  'Headshots %': '50',
                  MVPs: '4',
                  'Penta Kills': '1',
                },
              },
              { player_id: 'friend', player_stats: { Result: '1' } },
            ],
          },
          {
            team_id: 'team-b',
            players: [{ player_id: 'rival', player_stats: { Result: '0' } }],
          },
        ],
      },
    ],
  };
}

describe('FACEIT match journal rules', () => {
  it('parses history and keeps only rows with a match id', () => {
    expect(
      parseFaceitHistory({
        items: [
          {
            match_id: '1-abc',
            status: 'finished',
            game_mode: '5v5',
            competition_type: 'Matchmaking',
            started_at: START.getTime() / 1000,
            finished_at: FINISH.getTime() / 1000,
          },
          { status: 'FINISHED' },
        ],
      }),
    ).toEqual([item()]);
    expect(parseFaceitHistory(null)).toEqual([]);
  });

  it('counts only finished 5v5 matchmaking matches of a real length', () => {
    expect(faceitMatchEligibility(item())).toBeNull();
    expect(faceitMatchEligibility(item({ status: 'ONGOING' }))).toBe(
      'NOT_FINISHED',
    );
    expect(faceitMatchEligibility(item({ gameMode: '1v1' }))).toBe('NOT_5V5');
    expect(faceitMatchEligibility(item({ competitionType: 'hub' }))).toBe(
      'NOT_MATCHMAKING',
    );
    expect(faceitMatchEligibility(item({ startedAt: null }))).toBe('NO_TIMES');
    expect(
      faceitMatchEligibility(
        item({ finishedAt: new Date(START.getTime() + 10 * 60 * 1000) }),
      ),
    ).toBe('TOO_SHORT');
  });

  it('finds the paid club session that holds the whole match', () => {
    const now = new Date('2026-11-09T17:00:00Z');
    expect(sessionForMatch([session()], START, FINISH, now)?.storeId).toBe(
      'store-1',
    );
    // Clock drift of a few minutes is tolerated on both ends.
    expect(
      sessionForMatch(
        [
          session({
            startedAt: new Date(START.getTime() + FACEIT_SESSION_SLACK_MS / 2),
            stoppedAt: new Date(FINISH.getTime() - FACEIT_SESSION_SLACK_MS / 2),
          }),
        ],
        START,
        FINISH,
        now,
      ),
    ).not.toBeNull();
    // A match played after the guest left the club does not count.
    expect(
      sessionForMatch(
        [session({ stoppedAt: new Date('2026-11-09T15:10:00Z') })],
        START,
        FINISH,
        now,
      ),
    ).toBeNull();
    expect(
      sessionForMatch(
        [session({ startedAt: new Date('2026-11-09T15:20:00Z') })],
        START,
        FINISH,
        now,
      ),
    ).toBeNull();
    // An open session counts only while it is recent.
    const open = session({ stoppedAt: null });
    expect(sessionForMatch([open], START, FINISH, now)).not.toBeNull();
    expect(
      sessionForMatch(
        [open],
        START,
        FINISH,
        new Date(
          (open.startedAt as Date).getTime() + FACEIT_OPEN_SESSION_MAX_MS + 1,
        ),
      ),
    ).toBeNull();
  });

  it('reads player stats and flags linked guests on the other team', () => {
    const stats = parseFaceitMatchStats(faceitStatsBody());
    expect(stats).not.toBeNull();
    expect(faceitMissionFacts(stats!, 'me')).toEqual({
      provider: 'FACEIT',
      game: 'cs2',
      result: 'WIN',
      kills: 24,
      deaths: 15,
      assists: 5,
      kd: 1.6,
      adr: 92.4,
      hsPercent: 50,
      mvps: 4,
      aces: 1,
      map: 'de_mirage',
    });
    expect(faceitMissionFacts(stats!, 'stranger')).toBeNull();
    expect(
      opposingLinkedPlayers(stats!, 'me', new Set(['me', 'friend'])),
    ).toEqual([]);
    expect(
      opposingLinkedPlayers(stats!, 'me', new Set(['me', 'friend', 'rival'])),
    ).toEqual(['rival']);
    expect(parseFaceitMatchStats({ rounds: [] })).toBeNull();
  });
});

describe('FACEIT live response shape (checked 09.11.2026)', () => {
  it('reads history and stats exactly as FACEIT Data API v4 returns them', () => {
    // Trimmed from a live response: lowercase status, unix seconds.
    const [history] = parseFaceitHistory({
      items: [
        {
          match_id: '1-269f2966-3dd5-4230-b753-d5439984a482',
          status: 'finished',
          game_mode: '5v5',
          competition_type: 'matchmaking',
          started_at: 1794137622,
          finished_at: 1794141400,
        },
      ],
    });
    expect(faceitMatchEligibility(history)).toBeNull();

    const stats = parseFaceitMatchStats({
      rounds: [
        {
          round_stats: { Map: 'de_mirage', Score: '13 / 9' },
          teams: [
            {
              team_id: 'd5718986-aae9-47c5-8c67-ae4760ba1861',
              players: [
                {
                  player_id: 'ac71ba3c-d3d4-45e7-8be2-26aa3986867d',
                  player_stats: {
                    'Headshots %': '80',
                    Assists: '7',
                    ADR: '93.7',
                    Deaths: '24',
                    MVPs: '8',
                    Kills: '35',
                    Result: '1',
                    'K/D Ratio': '1.46',
                    'K/R Ratio': '1.2',
                    'Penta Kills': '0',
                    'Quadro Kills': '1',
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(
      faceitMissionFacts(stats!, 'ac71ba3c-d3d4-45e7-8be2-26aa3986867d'),
    ).toMatchObject({
      result: 'WIN',
      kills: 35,
      deaths: 24,
      assists: 7,
      kd: 1.46,
      adr: 93.7,
      hsPercent: 80,
      mvps: 8,
      aces: 0,
      map: 'de_mirage',
    });
  });
});

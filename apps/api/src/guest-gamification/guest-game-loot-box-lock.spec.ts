import { acquireGuestGameLootBoxRuleLock } from './guest-game-loot-box-lock';

describe('acquireGuestGameLootBoxRuleLock', () => {
  it('casts PostgreSQL void lock results to a Prisma-supported scalar', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ lock: '' }]);

    await acquireGuestGameLootBoxRuleLock(
      { $queryRaw: queryRaw } as never,
      'tenant-1',
      'loot-box-1',
    );

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [query] = queryRaw.mock.calls[0] as [{ strings: readonly string[] }];
    expect(query.strings.join('')).toContain(')::text');
  });
});

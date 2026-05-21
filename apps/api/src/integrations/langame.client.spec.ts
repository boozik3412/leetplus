import { LangameClient } from './langame.client';

describe('LangameClient', () => {
  const originalFetch = global.fetch;
  let client: LangameClient;

  beforeEach(() => {
    client = new LangameClient();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('retries date requests with European dates when ISO dates return an empty list', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(responseWithRows([]))
      .mockResolvedValueOnce(responseWithRows([{ id: 1 }]));
    global.fetch = fetchMock as typeof fetch;

    const rows = await client.listGuestSessions(
      'https://443.langame.ru/public_api',
      'test-key',
      {
        page: 1,
        pageLimit: 200,
        dateFrom: '2026-05-21',
        dateTo: '2026-05-21',
      },
    );

    expect(rows).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>;
    const firstUrl = new URL(calls[0][0]);
    const secondUrl = new URL(calls[1][0]);

    expect(firstUrl.searchParams.get('date_from')).toBe('2026-05-21');
    expect(secondUrl.searchParams.get('date_from')).toBe('21.05.2026');
    expect(secondUrl.searchParams.get('date_to')).toBe('21.05.2026');
  });

  it('does not retry date requests when ISO dates return rows', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(responseWithRows([{ id: 1 }]));
    global.fetch = fetchMock as typeof fetch;

    const rows = await client.listTransactions(
      'https://443.langame.ru/public_api',
      'test-key',
      {
        page: 1,
        pageLimit: 200,
        dateFrom: '2026-05-21',
        dateTo: '2026-05-21',
      },
    );

    expect(rows).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function responseWithRows(rows: unknown[]) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({ status: true, data: rows }),
  };
}

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

  it('loads guest balance topups with the required date window and pagination', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      responseWithRows([
        {
          id: 42,
          guest_id: 6330,
          amount: '500.00',
          date: '2026-07-14 12:00:00',
        },
      ]),
    );
    global.fetch = fetchMock as typeof fetch;

    const rows = await client.listBalanceTopups(
      'https://443.langame.ru/public_api',
      'test-key',
      {
        page: 2,
        pageLimit: 200,
        dateFrom: '2026-07-01',
        dateTo: '2026-07-15',
      },
    );

    expect(rows).toEqual([
      {
        id: 42,
        guest_id: 6330,
        amount: '500.00',
        date: '2026-07-14 12:00:00',
      },
    ]);

    const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>;
    const url = new URL(calls[0][0]);
    expect(url.pathname).toBe('/public_api/balances/list');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('page_limit')).toBe('200');
    expect(url.searchParams.get('date_from')).toBe('2026-07-01');
    expect(url.searchParams.get('date_to')).toBe('2026-07-15');
  });

  it('loads tariff type groups used by session billing classification', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        responseWithRows([{ id: 1, type: 'basic', name: 'Hourly' }]),
      );
    global.fetch = fetchMock as typeof fetch;

    const rows = await client.listTariffTypeGroups(
      'https://443.langame.ru/public_api',
      'test-key',
    );

    expect(rows).toEqual([{ id: 1, type: 'basic', name: 'Hourly' }]);
    const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>;
    expect(new URL(calls[0][0]).pathname).toBe(
      '/public_api/tariffs/types_groups/list',
    );
  });

  it('passes an abort signal when guest session requests are bounded by timeout', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(responseWithRows([{ id: 1 }]));
    global.fetch = fetchMock as typeof fetch;

    await client.listGuestSessions(
      'https://443.langame.ru/public_api',
      'test-key',
      {
        page: 1,
        pageLimit: 200,
        dateFrom: '2026-05-21',
        dateTo: '2026-05-21',
      },
      { timeoutMs: 123 },
    );

    const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>;

    expect(calls[0][1]?.signal).toBeDefined();
  });

  it('retries operation log requests with European dates when ISO dates return 400', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(responseWithError(400, 'Bad Request'))
      .mockResolvedValueOnce(responseWithRows([{ id: 1 }]));
    global.fetch = fetchMock as typeof fetch;

    const rows = await client.listAllOperationsLog(
      'https://443.langame.ru/public_api',
      'test-key',
      {
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

  it('posts guest search payload without putting the API key into the body', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      responseWithBody({
        status: true,
        data: [{ guest_id: 123 }],
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    const payload = await client.searchGuests(
      'https://443.langame.ru/public_api',
      'test-key',
      {
        search: '+7 999 123-45-67',
        phone: '79991234567',
      },
    );

    expect(payload).toEqual({
      status: true,
      data: [{ guest_id: 123 }],
    });

    const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>;
    const url = new URL(calls[0][0]);
    const init = calls[0][1];

    expect(url.toString()).toBe(
      'https://443.langame.ru/public_api/guests/search',
    );
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-API-KEY': 'test-key',
    });
    expect(typeof init?.body).toBe('string');
    expect(JSON.parse(init?.body as string)).toEqual({
      search: '+7 999 123-45-67',
      phone: '79991234567',
    });
  });

  it('loads diagnostic GET endpoints with query params without putting the API key into the URL', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      responseWithBody({
        status: true,
        data: { version: '1.2.3' },
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    const payload = await client.getDiagnosticEndpoint(
      'https://443.langame.ru/public_api',
      'test-key',
      '/transactions/list',
      {
        page: '1',
        page_limit: '20',
        date_from: '2026-06-01',
        date_to: '2026-06-01',
      },
    );

    expect(payload).toEqual({
      status: true,
      data: { version: '1.2.3' },
    });

    const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>;
    const url = new URL(calls[0][0]);
    const init = calls[0][1];

    expect(url.origin + url.pathname).toBe(
      'https://443.langame.ru/public_api/transactions/list',
    );
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('page_limit')).toBe('20');
    expect(url.searchParams.get('date_from')).toBe('2026-06-01');
    expect(url.searchParams.get('date_to')).toBe('2026-06-01');
    expect(url.searchParams.get('api_key')).toBeNull();
    expect(init?.method).toBe('GET');
    expect(init?.headers).toMatchObject({
      'X-API-KEY': 'test-key',
    });
  });

  it('posts master balance updates by phone with X-Request-Token and no public API key header', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      responseWithBody({
        status: true,
        data: { id: 42 },
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    const payload = await client.adjustGuestBalanceByPhone(
      'https://46.langamepro.ru/public_api',
      'request-token',
      {
        phone: '79999999999',
        type: 'bonus_balance',
        sum: 10,
        comment: 'LeetPlus test',
      },
    );

    expect(payload).toEqual({
      status: true,
      data: { id: 42 },
    });

    const calls = fetchMock.mock.calls as Array<[string | URL, RequestInit?]>;
    const url = new URL(calls[0][0]);
    const init = calls[0][1];

    expect(url.toString()).toBe(
      'https://46.langamepro.ru/master_api/guests/balance/phone',
    );
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Request-Token': 'request-token',
    });
    expect(
      Object.prototype.hasOwnProperty.call(init?.headers ?? {}, 'X-API-KEY'),
    ).toBe(false);
    expect(init?.body).toBe(
      JSON.stringify({
        phone: '79999999999',
        type: 'bonus_balance',
        sum: 10,
        comment: 'LeetPlus test',
      }),
    );
  });

  it('loads active product groups from the domain master API', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        error_code: 0,
        items: [{ id: 7, name: 'Энергетики' }],
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(
      client.listActiveProductGroups(
        'https://46.langamepro.ru/public_api',
        'master-key',
      ),
    ).resolves.toEqual([{ id: 7, name: 'Энергетики' }]);

    const calls = fetchMock.mock.calls as Array<[string | URL, RequestInit?]>;
    expect(new URL(calls[0][0]).pathname).toBe(
      '/master_api/products/groups/active',
    );
    expect(calls[0][1]?.headers).toMatchObject({
      'X-API-KEY': 'master-key',
    });
  });

  it('loads club product configuration with X-Request-Token', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        error_code: 0,
        items: [
          {
            id: 70,
            product_id: 10,
            product_name: 'Burn',
            club_id: 2,
            group_id: 7,
          },
        ],
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(
      client.listClubProductConfiguration(
        'https://46.langamepro.ru/public_api',
        'request-token',
        2,
      ),
    ).resolves.toEqual([
      {
        id: 70,
        product_id: 10,
        product_name: 'Burn',
        club_id: 2,
        group_id: 7,
      },
    ]);

    const calls = fetchMock.mock.calls as Array<[string | URL, RequestInit?]>;
    expect(new URL(calls[0][0]).pathname).toBe(
      '/master_api/products/configuration/club/2',
    );
    expect(calls[0][1]?.headers).toMatchObject({
      'X-Request-Token': 'request-token',
    });
  });
});

function responseWithRows(rows: unknown[]) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({ status: true, data: rows }),
  };
}

function responseWithError(status: number, statusText: string) {
  return {
    ok: false,
    status,
    statusText,
    text: jest.fn().mockResolvedValue('Validation failed'),
  };
}

function responseWithBody(body: unknown) {
  return {
    ok: true,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

import {
  isLangameRateLimitError,
  isLangameTransientError,
  withLangameTransientRetry,
} from './langame-transient-retry';

describe('Langame transient retry', () => {
  it.each([
    'Langame /guests/bonus_balance failed: 502 Bad Gateway - <html>',
    'Langame /guests/list failed: 503 Service Unavailable',
    'Langame /guests/list failed: 504 Gateway Time-out',
    'fetch failed',
    'socket hang up',
  ])('treats %s as transient', (message) => {
    expect(isLangameTransientError(new Error(message))).toBe(true);
  });

  it('reads the network cause of a failed fetch', () => {
    const error = new TypeError('fetch failed');
    Object.assign(error, { cause: new Error('read ECONNRESET') });
    expect(isLangameTransientError(error)).toBe(true);
  });

  it.each([
    'No permissions to access this route',
    'Langame /guests/logs failed: 400 Bad Request - {"field":"guest_id"}',
    'Langame /guests/list failed: 401 Unauthorized',
    'database constraint violation',
  ])('never retries %s', (message) => {
    expect(isLangameTransientError(new Error(message))).toBe(false);
  });

  it('retries a transient read and returns the next answer', async () => {
    const read = jest
      .fn()
      .mockRejectedValueOnce(new Error('502 Bad Gateway'))
      .mockResolvedValueOnce(['row']);

    await expect(withLangameTransientRetry(read, [0, 0])).resolves.toEqual([
      'row',
    ]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('gives up after the bounded attempts', async () => {
    const read = jest.fn().mockRejectedValue(new Error('502 Bad Gateway'));

    await expect(withLangameTransientRetry(read, [0, 0])).rejects.toThrow(
      '502',
    );
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('does not retry a permission denial', async () => {
    const read = jest.fn().mockRejectedValue(new Error('No permissions'));

    await expect(withLangameTransientRetry(read, [0, 0])).rejects.toThrow(
      'No permissions',
    );
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('waits out a 429 and reads the same page again', async () => {
    const tooMany = new Error(
      'Langame /guests/list failed: 429 Too Many Requests - {"status":429,"detail":"Too Many Requests"}',
    );
    expect(isLangameRateLimitError(tooMany)).toBe(true);
    expect(isLangameTransientError(tooMany)).toBe(false);
    const read = jest
      .fn()
      .mockRejectedValueOnce(tooMany)
      .mockRejectedValueOnce(tooMany)
      .mockRejectedValueOnce(new Error('502 Bad Gateway'))
      .mockResolvedValueOnce(['row']);

    await expect(
      withLangameTransientRetry(read, [0], [0, 0, 0]),
    ).resolves.toEqual(['row']);
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('gives up on a 429 that outlasts its pauses', async () => {
    const read = jest
      .fn()
      .mockRejectedValue(new Error('429 Too Many Requests'));

    await expect(withLangameTransientRetry(read, [0], [0, 0])).rejects.toThrow(
      '429',
    );
    expect(read).toHaveBeenCalledTimes(3);
  });
});

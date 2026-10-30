import { createLangameFetch, loadLangameProxyUrl } from './langame-fetch';

describe('Langame fetch', () => {
  it('uses the global fetch when no proxy is configured', async () => {
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('ok'));

    const langameFetch = createLangameFetch({});
    await langameFetch('https://1337.langame.ru/public_api/clubs/list');

    expect(spy).toHaveBeenCalledWith(
      'https://1337.langame.ru/public_api/clubs/list',
      undefined,
    );
    spy.mockRestore();
  });

  it('accepts a plain http proxy address', () => {
    expect(
      loadLangameProxyUrl({ LANGAME_PROXY_URL: ' http://172.30.44.2:3128 ' }),
    ).toBe('http://172.30.44.2:3128');
    expect(loadLangameProxyUrl({ LANGAME_PROXY_URL: '' })).toBeNull();
  });

  it.each([
    'socks5://172.30.44.2:1080',
    'http://user:secret@172.30.44.2:3128',
    'not a url',
  ])('refuses %s as a proxy address', (value) => {
    expect(() => loadLangameProxyUrl({ LANGAME_PROXY_URL: value })).toThrow(
      'LANGAME_PROXY_URL',
    );
  });
});

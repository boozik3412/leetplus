import {
  apiRuntimeAllowsPath,
  apiRuntimePerimeter,
} from './api-runtime-perimeter';

describe('API runtime HTTP perimeter', () => {
  it.each([
    ['/guest-portal', true],
    ['/guest-portal/acme/store/user-call-auth/start', true],
    ['/public/guest-game/media/asset-id', true],
    ['/health', true],
    ['/health/live', true],
    ['/health/ready', true],
    ['/version', true],
    ['/auth/login', false],
    ['/stores', false],
    ['/guest-portal-evil', false],
    ['/public/guest-game/media-evil', false],
    ['/health/internal', false],
    ['/', false],
  ])('classifies guest path %s as allowed=%s', (path, allowed) => {
    expect(apiRuntimeAllowsPath('GUEST', path)).toBe(allowed);
  });

  it('keeps public guest paths out of the corporate runtime', () => {
    expect(apiRuntimeAllowsPath('CORPORATE', '/auth/login')).toBe(true);
    expect(apiRuntimeAllowsPath('CORPORATE', '/stores')).toBe(true);
    expect(apiRuntimeAllowsPath('CORPORATE', '/health/ready')).toBe(true);
    expect(apiRuntimeAllowsPath('CORPORATE', '/guest-portal')).toBe(false);
    expect(
      apiRuntimeAllowsPath(
        'CORPORATE',
        '/guest-portal/acme/store/user-call-auth/status',
      ),
    ).toBe(false);
    expect(
      apiRuntimeAllowsPath('CORPORATE', '/public/guest-game/media/asset-id'),
    ).toBe(false);
    expect(apiRuntimeAllowsPath('CORPORATE', '/guest-portal-evil')).toBe(true);
  });

  it('preserves the current combined runtime during migration', () => {
    expect(apiRuntimeAllowsPath('COMBINED', '/auth/login')).toBe(true);
    expect(apiRuntimeAllowsPath('COMBINED', '/guest-portal/acme')).toBe(true);
    expect(apiRuntimeAllowsPath('COMBINED', '/anything')).toBe(true);
  });

  it('returns a generic 404 before a denied route reaches Nest', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const next = jest.fn();
    const middleware = apiRuntimePerimeter('GUEST');

    middleware({ path: '/auth/me' } as never, { status, json } as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Not Found',
    });
  });
});

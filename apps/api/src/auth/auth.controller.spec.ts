import type { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

const INVITE_TOKEN = 'A'.repeat(43);

describe('AuthController invite secret transport', () => {
  function createController() {
    const authService = {
      getInvite: jest.fn(),
      acceptInvite: jest.fn(),
    };
    return {
      authService,
      controller: new AuthController(authService as unknown as AuthService),
    };
  }

  it('forwards preview token only from the request body', async () => {
    const { authService, controller } = createController();
    authService.getInvite.mockResolvedValue({ expiresAt: 'future' });

    await expect(
      controller.getInvite({ token: INVITE_TOKEN }, 'application/json'),
    ).resolves.toEqual({ expiresAt: 'future' });
    expect(authService.getInvite).toHaveBeenCalledWith(INVITE_TOKEN);
  });

  it('forwards acceptance token and fields only from the request body', async () => {
    const { authService, controller } = createController();
    const dto = {
      token: INVITE_TOKEN,
      email: 'invitee@example.test',
      password: 'strong-password',
      confirmPassword: 'strong-password',
    };
    authService.acceptInvite.mockResolvedValue({ user: { id: 'user-1' } });

    await expect(
      controller.acceptInvite(dto, 'application/json; charset=utf-8'),
    ).resolves.toEqual({
      user: { id: 'user-1' },
    });
    expect(authService.acceptInvite).toHaveBeenCalledWith(INVITE_TOKEN, dto);
  });

  it('rejects a non-JSON media type before forwarding an invite secret', () => {
    const { authService, controller } = createController();

    expect(() =>
      controller.getInvite({ token: INVITE_TOKEN }, 'text/plain'),
    ).toThrow('Некорректный запрос приглашения');
    expect(authService.getInvite).not.toHaveBeenCalled();
  });

  it('returns the guard-verified user without losing tenant context', () => {
    const { authService, controller } = createController();
    const user = {
      id: 'platform-admin-1',
      isPlatformAdmin: true,
      platformTenantContext: true,
      tenantId: 'tenant-b',
    } as never;

    expect(controller.me(user)).toBe(user);
    expect(authService).not.toHaveProperty('me');
  });
});

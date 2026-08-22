import {
  buildInitialOwnerInviteMessage,
  buildInitialOwnerMessageId,
  buildInitialOwnerRegistrationUrl,
} from './identity-mail-worker-template';

const TOKEN = 'A'.repeat(43);
const MESSAGE_KEY = '22222222-2222-4222-8222-222222222222';

describe('identity mail worker template', () => {
  it('builds only the fragment-based registration URL', () => {
    const url = buildInitialOwnerRegistrationUrl('https://leetplus.ru', TOKEN);
    expect(url).toBe(`https://leetplus.ru/register#invite=${TOKEN}`);
    expect(url).not.toContain('?invite=');
    expect(new URL(url).pathname).toBe('/register');
    expect(new URL(url).search).toBe('');
  });

  it('derives a stable Message-ID without recipient data', () => {
    expect(buildInitialOwnerMessageId(MESSAGE_KEY, 'mail.leetplus.ru')).toBe(
      `<initial-owner-${MESSAGE_KEY}@mail.leetplus.ru>`,
    );
  });

  it('places the secret only in the fragment link in text and HTML bodies', () => {
    const message = buildInitialOwnerInviteMessage({
      recipientEmail: 'owner@example.test',
      token: TOKEN,
      messageKey: MESSAGE_KEY,
      publicWebOrigin: 'https://leetplus.ru',
      smtp: {
        from: 'no-reply@leetplus.ru',
        messageIdDomain: 'mail.leetplus.ru',
      },
    });
    expect(message).toMatchObject({
      to: 'owner@example.test',
      from: 'no-reply@leetplus.ru',
      messageId: `<initial-owner-${MESSAGE_KEY}@mail.leetplus.ru>`,
    });
    expect(message.text).toContain(`/register#invite=${TOKEN}`);
    expect(message.html).toContain(`/register#invite=${TOKEN}`);
    expect(message.text).not.toContain('?invite=');
    expect(message.html).not.toContain('?invite=');
  });

  it.each([
    ['foreign origin', 'https://attacker.example', TOKEN],
    ['trailing slash origin', 'https://leetplus.ru/', TOKEN],
    ['port origin', 'https://leetplus.ru:444', TOKEN],
    ['path origin', 'https://leetplus.ru/register', TOKEN],
    ['query origin', 'https://leetplus.ru?source=mail', TOKEN],
    ['fragment origin', 'https://leetplus.ru#wrong', TOKEN],
    ['origin credentials', 'https://user:pass@leetplus.ru', TOKEN],
    ['short token', 'https://leetplus.ru', 'A'.repeat(42)],
    ['padded token', 'https://leetplus.ru', `${'A'.repeat(42)}=`],
  ])('rejects %s', (_case, origin, token) => {
    expect(() => buildInitialOwnerRegistrationUrl(origin, token)).toThrow();
  });
});

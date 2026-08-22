import {
  buildEmployeeInviteMessage,
  buildEmployeeInviteMessageId,
  buildEmployeeInviteRegistrationUrl,
} from './employee-invite-mail-template';

const token = 'A'.repeat(43);
const messageKey = '11111111-1111-4111-8111-111111111111';

describe('CURRENT189 employee invitation mail template', () => {
  it('keeps the token in a fragment-only registration URL', () => {
    expect(
      buildEmployeeInviteRegistrationUrl('https://leetplus.ru', token),
    ).toBe(`https://leetplus.ru/register#invite=${token}`);
  });

  it('builds a deterministic employee-specific message without role claims', () => {
    const message = buildEmployeeInviteMessage({
      recipientEmail: 'employee@example.invalid',
      token,
      messageKey,
      publicWebOrigin: 'https://leetplus.ru',
      from: 'LeetPlus <no-reply@leetplus.ru>',
      messageIdDomain: 'mail.leetplus.ru',
    });

    expect(message).toMatchObject({
      to: 'employee@example.invalid',
      messageId: `<employee-invite-${messageKey}@mail.leetplus.ru>`,
      subject: 'Приглашение в команду LeetPlus',
    });
    expect(message.text).toContain(`/register#invite=${token}`);
    expect(message.html).toContain(`/register#invite=${token}`);
    expect(JSON.stringify(message)).not.toMatch(
      /OWNER|ADMIN|NETWORK|storeIds/u,
    );
    expect(JSON.stringify(message)).not.toContain('?invite=');
  });

  it.each([
    ['https://example.invalid', token],
    ['https://leetplus.ru', 'short'],
  ])('rejects an untrusted origin or malformed token', (origin, value) => {
    expect(() => buildEmployeeInviteRegistrationUrl(origin, value)).toThrow(
      'EMPLOYEE_INVITE_REGISTRATION_URL_INPUT_INVALID',
    );
  });

  it.each([
    ['not-a-uuid', 'mail.leetplus.ru'],
    [messageKey, 'localhost'],
  ])('rejects an invalid message-id binding', (key, domain) => {
    expect(() => buildEmployeeInviteMessageId(key, domain)).toThrow(
      'EMPLOYEE_INVITE_MESSAGE_ID_INPUT_INVALID',
    );
  });
});

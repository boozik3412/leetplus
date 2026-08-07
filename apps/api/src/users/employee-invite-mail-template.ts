import type { IdentityMailMessage } from '../identity-mail-worker/identity-mail-worker.types';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DNS_NAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const PUBLIC_WEB_ORIGIN = 'https://leetplus.ru' as const;

export class EmployeeInviteMailTemplateError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'EmployeeInviteMailTemplateError';
  }
}

export function buildEmployeeInviteRegistrationUrl(
  publicWebOrigin: string,
  token: string,
) {
  if (publicWebOrigin !== PUBLIC_WEB_ORIGIN || !TOKEN_PATTERN.test(token)) {
    return fail('EMPLOYEE_INVITE_REGISTRATION_URL_INPUT_INVALID');
  }
  return `${PUBLIC_WEB_ORIGIN}/register#invite=${token}`;
}

export function buildEmployeeInviteMessageId(
  messageKey: string,
  messageIdDomain: string,
) {
  if (
    !UUID_PATTERN.test(messageKey) ||
    !DNS_NAME_PATTERN.test(messageIdDomain)
  ) {
    return fail('EMPLOYEE_INVITE_MESSAGE_ID_INPUT_INVALID');
  }
  return `<employee-invite-${messageKey}@${messageIdDomain}>`;
}

export function buildEmployeeInviteMessage(input: {
  recipientEmail: string;
  token: string;
  messageKey: string;
  publicWebOrigin: string;
  from: string;
  messageIdDomain: string;
}): IdentityMailMessage {
  const registrationUrl = buildEmployeeInviteRegistrationUrl(
    input.publicWebOrigin,
    input.token,
  );
  const messageId = buildEmployeeInviteMessageId(
    input.messageKey,
    input.messageIdDomain,
  );
  const escapedUrl = escapeHtml(registrationUrl);
  return {
    to: input.recipientEmail,
    from: input.from,
    messageId,
    subject: 'Приглашение в команду LeetPlus',
    text: [
      'Здравствуйте!',
      '',
      'Владелец клуба пригласил вас в команду LeetPlus.',
      'Откройте ссылку и задайте собственный пароль:',
      registrationUrl,
      '',
      'Если вы не ожидали это приглашение, проигнорируйте письмо.',
    ].join('\n'),
    html: [
      '<p>Здравствуйте!</p>',
      '<p>Владелец клуба пригласил вас в команду LeetPlus.</p>',
      `<p><a href="${escapedUrl}">Открыть приглашение и задать пароль</a></p>`,
      '<p>Если вы не ожидали это приглашение, проигнорируйте письмо.</p>',
    ].join(''),
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function fail(reasonCode: string): never {
  throw new EmployeeInviteMailTemplateError(reasonCode);
}

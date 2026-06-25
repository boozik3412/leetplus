import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEV_INVITE_TOKEN_SECRET =
  'leetplus-dev-jwt-secret-change-before-production';
const SIGNED_INVITE_TOKEN_PREFIX = 'invite_v2';

function inviteTokenSecret(configService: ConfigService) {
  return (
    configService.get<string>('USER_INVITE_TOKEN_SECRET')?.trim() ||
    configService.get<string>('JWT_SECRET')?.trim() ||
    DEV_INVITE_TOKEN_SECRET
  );
}

function signInviteId(inviteId: string, configService: ConfigService) {
  return createHmac('sha256', inviteTokenSecret(configService))
    .update(`user-invite:${inviteId}`)
    .digest('base64url');
}

export function createSignedUserInviteToken(
  inviteId: string,
  configService: ConfigService,
) {
  return `${SIGNED_INVITE_TOKEN_PREFIX}.${inviteId}.${signInviteId(
    inviteId,
    configService,
  )}`;
}

export function resolveSignedUserInviteToken(
  token: string,
  configService: ConfigService,
) {
  const parts = token.split('.');
  const [prefix, inviteId, signature] = parts;

  if (
    parts.length !== 3 ||
    prefix !== SIGNED_INVITE_TOKEN_PREFIX ||
    !inviteId ||
    !signature
  ) {
    return null;
  }

  const expectedSignature = signInviteId(inviteId, configService);
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(signature);

  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  return inviteId;
}

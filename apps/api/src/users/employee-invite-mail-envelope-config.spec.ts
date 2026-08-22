import type { ConfigService } from '@nestjs/config';
import {
  EMPLOYEE_INVITE_AAD_ENVIRONMENT_ENV,
  EMPLOYEE_INVITE_ENCRYPTION_KEY_ENV,
  EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION_ENV,
  resolveEmployeeInviteEnvelopeConfig,
} from './employee-invite-mail-envelope-config';

const employeeKey = Buffer.from(
  Array.from({ length: 32 }, (_, i) => i + 1),
).toString('base64url');

describe('CURRENT189 employee invite envelope configuration', () => {
  it('requires a separate exact key, version, and AAD environment', () => {
    const result = resolveEmployeeInviteEnvelopeConfig(
      config({
        [EMPLOYEE_INVITE_ENCRYPTION_KEY_ENV]: employeeKey,
        [EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION_ENV]: 'v1',
        [EMPLOYEE_INVITE_AAD_ENVIRONMENT_ENV]: 'local-current189',
      }),
    );

    expect(result).toEqual({
      encryptionKey: Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)),
      keyVersion: 'v1',
      aadEnvironment: 'local-current189',
    });
  });

  it.each([
    [{}, 'missing values'],
    [
      {
        [EMPLOYEE_INVITE_ENCRYPTION_KEY_ENV]: 'short',
        [EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION_ENV]: 'v1',
        [EMPLOYEE_INVITE_AAD_ENVIRONMENT_ENV]: 'local-current189',
      },
      'invalid key',
    ],
    [
      {
        [EMPLOYEE_INVITE_ENCRYPTION_KEY_ENV]: employeeKey,
        [EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION_ENV]: 'v2',
        [EMPLOYEE_INVITE_AAD_ENVIRONMENT_ENV]: 'local-current189',
      },
      'wrong version',
    ],
    [
      {
        [EMPLOYEE_INVITE_ENCRYPTION_KEY_ENV]: employeeKey,
        [EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION_ENV]: 'v1',
        [EMPLOYEE_INVITE_AAD_ENVIRONMENT_ENV]: 'Production Invalid',
      },
      'invalid AAD environment',
    ],
  ])('fails closed for %s (%s)', (values) => {
    expect(() => resolveEmployeeInviteEnvelopeConfig(config(values))).toThrow(
      'Employee invite encryption configuration is unavailable',
    );
  });

  it.each([
    'IDENTITY_MAIL_ENCRYPTION_KEY',
    'JWT_SECRET',
    'APP_ENCRYPTION_KEY',
    'INTEGRATION_ENCRYPTION_KEY',
    'IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY',
  ])('rejects key reuse with %s', (otherKey) => {
    expect(() =>
      resolveEmployeeInviteEnvelopeConfig(
        config({
          [EMPLOYEE_INVITE_ENCRYPTION_KEY_ENV]: employeeKey,
          [EMPLOYEE_INVITE_ENCRYPTION_KEY_VERSION_ENV]: 'v1',
          [EMPLOYEE_INVITE_AAD_ENVIRONMENT_ENV]: 'local-current189',
          [otherKey]: employeeKey,
        }),
      ),
    ).toThrow('Employee invite encryption configuration is unavailable');
  });
});

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

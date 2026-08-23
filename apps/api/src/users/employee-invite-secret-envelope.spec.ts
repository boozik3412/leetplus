import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  EMPLOYEE_INVITE_MAIL_TEMPLATE,
  EMPLOYEE_INVITE_SECRET_ENVELOPE_BYTES,
  EmployeeInviteSecretEnvelope,
  type EmployeeInviteSecretBinding,
} from './employee-invite-secret-envelope';

const binding: EmployeeInviteSecretBinding = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  deliveryLocator: '22222222-2222-4222-8222-222222222222',
  inviteId: '33333333-3333-4333-8333-333333333333',
  outboxId: '44444444-4444-4444-8444-444444444444',
  template: EMPLOYEE_INVITE_MAIL_TEMPLATE,
  messageKey: '55555555-5555-4555-8555-555555555555',
  requestDigest: 'a'.repeat(64),
  recipientEmail: 'employee@example.test',
  expiresAt: new Date('2026-08-10T12:00:00.000Z'),
};

function fixture() {
  const values = [Buffer.alloc(32, 7), Buffer.alloc(12, 9)];
  const randomSource = jest.fn((size: number) => {
    const value = values.shift();
    if (!value || value.length !== size) {
      throw new Error('Unexpected random request');
    }
    return Buffer.from(value);
  });
  const envelope = new EmployeeInviteSecretEnvelope(
    {
      encryptionKey: Buffer.alloc(32, 3),
      keyVersion: 'employee-v1',
      aadEnvironment: 'ci',
    },
    randomSource,
  );
  return { envelope, randomSource };
}

describe('EmployeeInviteSecretEnvelope', () => {
  it('seals and opens one mailbox-bound employee token under a separate AAD domain', () => {
    const { envelope, randomSource } = fixture();
    const sealed = envelope.seal(binding);
    const expectedToken = Buffer.alloc(32, 7).toString('base64url');

    expect(sealed).toMatchObject({
      tokenHash: createHash('sha256').update(expectedToken).digest('hex'),
      digestVersion: 'sha256-v1',
      envelopeVersion: 1,
      keyVersion: 'employee-v1',
      aadEnvironment: 'ci',
    });
    expect(sealed.secretCiphertext).toHaveLength(
      EMPLOYEE_INVITE_SECRET_ENVELOPE_BYTES,
    );
    expect(envelope.open(binding, sealed)).toBe(expectedToken);
    expect(randomSource).toHaveBeenCalledTimes(2);
  });

  it('rejects tenant, mailbox, request, expiry and template binding drift', () => {
    const mutations: EmployeeInviteSecretBinding[] = [
      { ...binding, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { ...binding, recipientEmail: 'other@example.test' },
      { ...binding, requestDigest: 'b'.repeat(64) },
      { ...binding, expiresAt: new Date('2026-08-10T12:00:01.000Z') },
      { ...binding, messageKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    ];

    for (const mutation of mutations) {
      const { envelope } = fixture();
      const sealed = envelope.seal(binding);
      expect(() => envelope.open(mutation, sealed)).toThrow(
        ServiceUnavailableException,
      );
    }
  });

  it('rejects malformed key material and non-canonical mailboxes fail closed', () => {
    expect(
      () =>
        new EmployeeInviteSecretEnvelope({
          encryptionKey: Buffer.alloc(31),
          keyVersion: 'employee-v1',
          aadEnvironment: 'ci',
        }),
    ).toThrow(ServiceUnavailableException);

    const { envelope } = fixture();
    expect(() =>
      envelope.seal({ ...binding, recipientEmail: 'Employee@example.test' }),
    ).toThrow(ServiceUnavailableException);
  });

  it('does not accept ciphertext under another employee key or environment', () => {
    const { envelope } = fixture();
    const sealed = envelope.seal(binding);
    const otherKey = new EmployeeInviteSecretEnvelope({
      encryptionKey: Buffer.alloc(32, 4),
      keyVersion: 'employee-v1',
      aadEnvironment: 'ci',
    });
    const otherEnvironment = new EmployeeInviteSecretEnvelope({
      encryptionKey: Buffer.alloc(32, 3),
      keyVersion: 'employee-v1',
      aadEnvironment: 'test',
    });

    expect(() => otherKey.open(binding, sealed)).toThrow(
      ServiceUnavailableException,
    );
    expect(() => otherEnvironment.open(binding, sealed)).toThrow(
      ServiceUnavailableException,
    );
  });
});

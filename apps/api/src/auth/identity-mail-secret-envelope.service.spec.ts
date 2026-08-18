import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  IDENTITY_MAIL_ENVELOPE_VERSION,
  IDENTITY_MAIL_SECRET_ENVELOPE_BYTES,
  IDENTITY_MAIL_TOKEN_DIGEST_VERSION,
  IdentityMailSecretBinding,
  IdentityMailSecretEnvelopeService,
  OpenIdentityMailInviteTokenInput,
  SealedIdentityMailInviteToken,
} from './identity-mail-secret-envelope.service';

const ENCRYPTION_KEY = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 1),
).toString('base64url');
const ALTERNATE_ENCRYPTION_KEY = Buffer.from(
  Array.from({ length: 32 }, (_, index) => 255 - index),
).toString('base64url');
const TENANT_ID = '00000000-0000-4000-8000-000000000000';
const WORKFLOW_LOCATOR = '11111111-1111-4111-8111-111111111111';
const INVITE_ID = '22222222-2222-4222-8222-222222222222';
const OUTBOX_ID = '33333333-3333-4333-8333-333333333333';
const MESSAGE_KEY = '44444444-4444-4444-8444-444444444444';
const REQUEST_DIGEST = 'a'.repeat(64);
const RECIPIENT_EMAIL = 'owner@example.test';

function binding(): IdentityMailSecretBinding {
  return {
    tenantId: TENANT_ID,
    workflowLocator: WORKFLOW_LOCATOR,
    inviteId: INVITE_ID,
    outboxId: OUTBOX_ID,
    template: 'INITIAL_OWNER_INVITE',
    messageKey: MESSAGE_KEY,
    requestDigest: REQUEST_DIGEST,
    recipientEmail: RECIPIENT_EMAIL,
    expiresAt: new Date('2026-08-01T12:34:56.789Z'),
  };
}

function createService(
  overrides: Record<string, unknown> = {},
): IdentityMailSecretEnvelopeService {
  return new IdentityMailSecretEnvelopeService(
    new ConfigService({
      IDENTITY_MAIL_ENCRYPTION_KEY: ENCRYPTION_KEY,
      IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: 'v1',
      IDENTITY_MAIL_AAD_ENVIRONMENT: 'test',
      ...overrides,
    }),
  );
}

function openInput(
  sealed: SealedIdentityMailInviteToken,
  secretBinding: IdentityMailSecretBinding = binding(),
): OpenIdentityMailInviteTokenInput {
  return {
    ...secretBinding,
    tokenHash: sealed.tokenHash,
    digestVersion: sealed.digestVersion,
    secretCiphertext: Buffer.from(sealed.secretCiphertext),
    envelopeVersion: sealed.envelopeVersion,
    keyVersion: sealed.keyVersion,
    aadEnvironment: sealed.aadEnvironment,
  };
}

function changedHex(value: string): string {
  return `${value[0] === 'a' ? 'b' : 'a'}${value.slice(1)}`;
}

function typeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typeScriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('IdentityMailSecretEnvelopeService', () => {
  it('is referenced only by approved owner-invite producers and the standalone worker consumer', () => {
    const implementationPath = join(
      __dirname,
      'identity-mail-secret-envelope.service.ts',
    );
    const allowedPaths = [
      join(
        __dirname,
        '..',
        'admin',
        'founder-operator-beta-activation.service.ts',
      ),
      join(
        __dirname,
        '..',
        'admin',
        'founder-owner-invite-lifecycle.service.ts',
      ),
      join(
        __dirname,
        '..',
        'identity-mail-worker',
        'identity-mail-worker.cli.ts',
      ),
    ].sort();
    const references = typeScriptFiles(join(__dirname, '..'))
      .filter(
        (path) =>
          path !== implementationPath &&
          path !== __filename &&
          !path.endsWith('.spec.ts'),
      )
      .filter((path) =>
        /IdentityMailSecretEnvelopeService|identity-mail-secret-envelope\.service/u.test(
          readFileSync(path, 'utf8'),
        ),
      );

    expect(references.sort()).toEqual(allowedPaths);
  });

  it('seals and opens the compatible 256-bit invite token contract', () => {
    const service = createService();
    const sealed = service.sealInitialOwnerInviteToken(binding());
    const rawToken = service.openInitialOwnerInviteToken(openInput(sealed));

    expect(sealed).not.toHaveProperty('rawToken');
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(Buffer.from(rawToken, 'base64url')).toHaveLength(32);
    expect(sealed.tokenHash).toBe(
      createHash('sha256').update(rawToken).digest('hex'),
    );
    expect(sealed.tokenHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(sealed.digestVersion).toBe(IDENTITY_MAIL_TOKEN_DIGEST_VERSION);
    expect(sealed.envelopeVersion).toBe(IDENTITY_MAIL_ENVELOPE_VERSION);
    expect(sealed.keyVersion).toBe('v1');
    expect(sealed.aadEnvironment).toBe('test');
    expect(Buffer.isBuffer(sealed.secretCiphertext)).toBe(true);
    expect(sealed.secretCiphertext).toHaveLength(
      IDENTITY_MAIL_SECRET_ENVELOPE_BYTES,
    );
    expect(sealed.secretCiphertext.subarray(0, 12)).toHaveLength(12);
    expect(sealed.secretCiphertext.subarray(12, 55)).toHaveLength(43);
    expect(sealed.secretCiphertext.subarray(55)).toHaveLength(16);
    expect(
      sealed.secretCiphertext.includes(Buffer.from(rawToken, 'utf8')),
    ).toBe(false);
  });

  it('uses fresh token and nonce entropy for every envelope', () => {
    const service = createService();
    const first = service.sealInitialOwnerInviteToken(binding());
    const second = service.sealInitialOwnerInviteToken(binding());
    const firstToken = service.openInitialOwnerInviteToken(openInput(first));
    const secondToken = service.openInitialOwnerInviteToken(openInput(second));

    expect(secondToken).not.toBe(firstToken);
    expect(second.tokenHash).not.toBe(first.tokenHash);
    expect(second.secretCiphertext.subarray(0, 12)).not.toEqual(
      first.secretCiphertext.subarray(0, 12),
    );
    expect(second.secretCiphertext.subarray(12, 55)).not.toEqual(
      first.secretCiphertext.subarray(12, 55),
    );
    expect(second.secretCiphertext).not.toEqual(first.secretCiphertext);
  });

  it.each([
    'Owner@example.test',
    ' owner@example.test',
    'Owner <owner@example.test>',
    'owner@example.test,attacker@example.test',
  ])(
    'rejects non-canonical recipient binding %s before entropy',
    (recipientEmail) => {
      const service = createService();
      const entropy = jest.spyOn(
        service as unknown as {
          secureRandomBytes: (size: number) => Buffer;
        },
        'secureRandomBytes',
      );

      expect(() =>
        service.sealInitialOwnerInviteToken({ ...binding(), recipientEmail }),
      ).toThrow('Identity mail secret envelope is invalid');
      expect(entropy).not.toHaveBeenCalled();
    },
  );

  it('builds deterministic canonical AAD with the fixed domain and schema', () => {
    const service = createService();
    const sealed = service.sealInitialOwnerInviteToken(binding());
    const internals = service as unknown as {
      canonicalBinding: (input: IdentityMailSecretBinding) => Omit<
        IdentityMailSecretBinding,
        'expiresAt'
      > & {
        expiresAt: string;
      };
      canonicalAad: (
        input: Omit<IdentityMailSecretBinding, 'expiresAt'> & {
          expiresAt: string;
        },
        tokenHash: string,
        digestVersion: typeof IDENTITY_MAIL_TOKEN_DIGEST_VERSION,
        keyVersion: 'v1',
        envelopeVersion: typeof IDENTITY_MAIL_ENVELOPE_VERSION,
      ) => Buffer;
    };
    const canonicalBinding = internals.canonicalBinding(binding());
    const aad = internals.canonicalAad(
      canonicalBinding,
      sealed.tokenHash,
      sealed.digestVersion,
      sealed.keyVersion,
      sealed.envelopeVersion,
    );

    expect(aad.toString('utf8')).toBe(
      `{"domain":"leetplus:identity-mail-secret-envelope","schemaVersion":2,"environment":"test","tenantId":"${TENANT_ID}","workflowLocator":"${WORKFLOW_LOCATOR}","inviteId":"${INVITE_ID}","outboxId":"${OUTBOX_ID}","template":"INITIAL_OWNER_INVITE","messageKey":"${MESSAGE_KEY}","requestDigest":"${REQUEST_DIGEST}","recipientEmail":"${RECIPIENT_EMAIL}","tokenHash":"${sealed.tokenHash}","digestVersion":"sha256-v1","expiresAt":"2026-08-01T12:34:56.789Z","keyVersion":"v1","envelopeVersion":1}`,
    );
    expect(
      internals.canonicalAad(
        canonicalBinding,
        sealed.tokenHash,
        sealed.digestVersion,
        sealed.keyVersion,
        sealed.envelopeVersion,
      ),
    ).toEqual(aad);
  });

  it('matches the fixed AES-256-GCM envelope and AAD known-answer vector', () => {
    const service = createService();
    const entropy = jest
      .spyOn(
        service as unknown as {
          secureRandomBytes: (size: number) => Buffer;
        },
        'secureRandomBytes',
      )
      .mockImplementation((size) => {
        if (size === 32) {
          return Buffer.from(Array.from({ length: 32 }, (_, index) => index));
        }
        if (size === 12) {
          return Buffer.from(
            Array.from({ length: 12 }, (_, index) => index + 32),
          );
        }
        throw new Error('Unexpected entropy request');
      });

    const sealed = service.sealInitialOwnerInviteToken(binding());

    expect(entropy.mock.calls).toEqual([[32], [12]]);
    expect(sealed).toEqual({
      tokenHash:
        'ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0',
      digestVersion: 'sha256-v1',
      secretCiphertext: Buffer.from(
        '202122232425262728292a2b36b2ff20b42c80815ac564d00448b6f015d4ebe891be23e9c1a87327c4638557d2ce3cd5ae9a1b742f38e4609d5f465e16a3c8c72384f33459d489',
        'hex',
      ),
      envelopeVersion: 1,
      keyVersion: 'v1',
      aadEnvironment: 'test',
    });
    expect(service.openInitialOwnerInviteToken(openInput(sealed))).toBe(
      'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
    );
  });

  it('verifies the versioned token hash without accepting malformed input', () => {
    const service = createService();
    const sealed = service.sealInitialOwnerInviteToken(binding());
    const rawToken = service.openInitialOwnerInviteToken(openInput(sealed));

    expect(
      service.verifyTokenHash(rawToken, sealed.tokenHash, sealed.digestVersion),
    ).toBe(true);
    expect(
      service.verifyTokenHash(
        rawToken,
        changedHex(sealed.tokenHash),
        sealed.digestVersion,
      ),
    ).toBe(false);
    expect(
      service.verifyTokenHash(
        `${rawToken.slice(0, 42)}!`,
        sealed.tokenHash,
        sealed.digestVersion,
      ),
    ).toBe(false);
    expect(service.verifyTokenHash(rawToken, 'A'.repeat(64), 'sha256-v1')).toBe(
      false,
    );
    expect(
      service.verifyTokenHash(rawToken, sealed.tokenHash, 'sha256-v2'),
    ).toBe(false);
  });

  it.each([
    [
      'tenantId',
      (input: OpenIdentityMailInviteTokenInput) => ({
        ...input,
        tenantId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      }),
    ],
    [
      'workflowLocator',
      (input: OpenIdentityMailInviteTokenInput) => ({
        ...input,
        workflowLocator: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    ],
    [
      'inviteId',
      (input: OpenIdentityMailInviteTokenInput) => ({
        ...input,
        inviteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ],
    [
      'outboxId',
      (input: OpenIdentityMailInviteTokenInput) => ({
        ...input,
        outboxId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    ],
    [
      'template',
      (input: OpenIdentityMailInviteTokenInput) =>
        ({
          ...input,
          template: 'OTHER_TEMPLATE',
        }) as unknown as OpenIdentityMailInviteTokenInput,
    ],
    [
      'messageKey',
      (input: OpenIdentityMailInviteTokenInput) => ({
        ...input,
        messageKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      }),
    ],
    [
      'requestDigest',
      (input: OpenIdentityMailInviteTokenInput) => ({
        ...input,
        requestDigest: changedHex(input.requestDigest),
      }),
    ],
    [
      'recipientEmail',
      (input: OpenIdentityMailInviteTokenInput) => ({
        ...input,
        recipientEmail: 'attacker@example.test',
      }),
    ],
    [
      'tokenHash',
      (input: OpenIdentityMailInviteTokenInput) => ({
        ...input,
        tokenHash: changedHex(input.tokenHash),
      }),
    ],
    [
      'digestVersion',
      (input: OpenIdentityMailInviteTokenInput) =>
        ({
          ...input,
          digestVersion: 'sha256-v2',
        }) as OpenIdentityMailInviteTokenInput,
    ],
    [
      'expiresAt',
      (input: OpenIdentityMailInviteTokenInput) => ({
        ...input,
        expiresAt: new Date(input.expiresAt.getTime() + 1),
      }),
    ],
    [
      'aadEnvironment',
      (input: OpenIdentityMailInviteTokenInput) => ({
        ...input,
        aadEnvironment: 'production',
      }),
    ],
    [
      'keyVersion',
      (input: OpenIdentityMailInviteTokenInput) =>
        ({
          ...input,
          keyVersion: 'v2',
        }) as OpenIdentityMailInviteTokenInput,
    ],
    [
      'envelopeVersion',
      (input: OpenIdentityMailInviteTokenInput) =>
        ({
          ...input,
          envelopeVersion: 2,
        }) as OpenIdentityMailInviteTokenInput,
    ],
  ] as const)(
    'rejects %s AAD or metadata tampering',
    (
      _field,
      mutate: (
        input: OpenIdentityMailInviteTokenInput,
      ) => OpenIdentityMailInviteTokenInput,
    ) => {
      const service = createService();
      const sealed = service.sealInitialOwnerInviteToken(binding());

      expect(() =>
        service.openInitialOwnerInviteToken(mutate(openInput(sealed))),
      ).toThrow('Identity mail secret envelope is invalid');
    },
  );

  it('binds ciphertext to the exact configured environment', () => {
    const producer = createService({
      IDENTITY_MAIL_AAD_ENVIRONMENT: 'staging',
    });
    const worker = createService({
      IDENTITY_MAIL_AAD_ENVIRONMENT: 'production',
    });
    const sealed = producer.sealInitialOwnerInviteToken(binding());

    expect(() => worker.openInitialOwnerInviteToken(openInput(sealed))).toThrow(
      'Identity mail secret envelope is invalid',
    );
  });

  it.each([
    ['nonce', 0],
    ['ciphertext', 12],
    ['authentication tag', IDENTITY_MAIL_SECRET_ENVELOPE_BYTES - 1],
  ])('rejects %s tampering', (_part, offset) => {
    const service = createService();
    const sealed = service.sealInitialOwnerInviteToken(binding());
    const input = openInput(sealed);
    input.secretCiphertext[offset] ^= 1;

    expect(() => service.openInitialOwnerInviteToken(input)).toThrow(
      'Identity mail secret envelope is invalid',
    );
  });

  it.each([
    Buffer.alloc(0),
    Buffer.alloc(IDENTITY_MAIL_SECRET_ENVELOPE_BYTES - 1),
    Buffer.alloc(IDENTITY_MAIL_SECRET_ENVELOPE_BYTES + 1),
  ])('rejects a malformed envelope length of %s bytes', (secretCiphertext) => {
    const service = createService();
    const sealed = service.sealInitialOwnerInviteToken(binding());

    expect(() =>
      service.openInitialOwnerInviteToken({
        ...openInput(sealed),
        secretCiphertext,
      }),
    ).toThrow('Identity mail secret envelope is invalid');
  });

  it('rejects a non-Buffer envelope even at the exact byte length', () => {
    const service = createService();
    const sealed = service.sealInitialOwnerInviteToken(binding());

    expect(() =>
      service.openInitialOwnerInviteToken({
        ...openInput(sealed),
        secretCiphertext: new Uint8Array(
          IDENTITY_MAIL_SECRET_ENVELOPE_BYTES,
        ) as unknown as Buffer,
      }),
    ).toThrow('Identity mail secret envelope is invalid');
  });

  it('rejects an exact-length envelope encrypted by another key', () => {
    const producer = createService();
    const otherKeyWorker = createService({
      IDENTITY_MAIL_ENCRYPTION_KEY: ALTERNATE_ENCRYPTION_KEY,
    });
    const sealed = producer.sealInitialOwnerInviteToken(binding());

    expect(() =>
      otherKeyWorker.openInitialOwnerInviteToken(openInput(sealed)),
    ).toThrow('Identity mail secret envelope is invalid');
  });

  it.each([
    ['missing key', { IDENTITY_MAIL_ENCRYPTION_KEY: undefined }],
    ['short key', { IDENTITY_MAIL_ENCRYPTION_KEY: 'short' }],
    [
      'degenerate key',
      {
        IDENTITY_MAIL_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64url'),
      },
    ],
    ['padded key', { IDENTITY_MAIL_ENCRYPTION_KEY: `${ENCRYPTION_KEY}=` }],
    [
      'missing key version',
      { IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: undefined },
    ],
    ['unsupported key version', { IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: 'v2' }],
    ['missing AAD environment', { IDENTITY_MAIL_AAD_ENVIRONMENT: undefined }],
    [
      'non-canonical AAD environment',
      { IDENTITY_MAIL_AAD_ENVIRONMENT: ' Production ' },
    ],
    ['reused APP key', { APP_ENCRYPTION_KEY: ENCRYPTION_KEY }],
    [
      'reused fingerprint key',
      { IDENTITY_EMAIL_FINGERPRINT_HMAC_KEY: ENCRYPTION_KEY },
    ],
    ['reused JWT key', { JWT_SECRET: ENCRYPTION_KEY }],
    [
      'reused guest portal JWT key',
      { GUEST_PORTAL_JWT_SECRET: ENCRYPTION_KEY },
    ],
    ['reused referral key', { GUEST_GAME_REFERRAL_SECRET: ENCRYPTION_KEY }],
    ['reused integration key', { INTEGRATION_ENCRYPTION_KEY: ENCRYPTION_KEY }],
    ['reused scheduler token', { SYNC_SERVICE_TOKEN: ENCRYPTION_KEY }],
  ])('fails closed before entropy use for a %s', (_case, overrides) => {
    const servicePrototype =
      IdentityMailSecretEnvelopeService.prototype as unknown as {
        secureRandomBytes: (size: number) => Buffer;
      };
    const randomBytesSpy = jest.spyOn(servicePrototype, 'secureRandomBytes');

    expect(() => createService(overrides)).toThrow(
      'Identity mail encryption is unavailable',
    );
    expect(randomBytesSpy).not.toHaveBeenCalled();

    randomBytesSpy.mockRestore();
  });

  it('classifies entropy failure separately without exposing its cause', () => {
    const service = createService();
    const entropy = jest
      .spyOn(
        service as unknown as {
          secureRandomBytes: (size: number) => Buffer;
        },
        'secureRandomBytes',
      )
      .mockImplementation(() => {
        throw new Error('provider-secret-detail');
      });
    let serializedError = '';

    try {
      service.sealInitialOwnerInviteToken(binding());
    } catch (error) {
      serializedError = JSON.stringify(error);
    }

    expect(serializedError).toContain('IDENTITY_MAIL_CRYPTOGRAPHY_UNAVAILABLE');
    expect(serializedError).not.toContain('provider-secret-detail');
    expect(entropy).toHaveBeenCalledTimes(1);
  });

  it('never includes key, token, hash, or ciphertext in an error', () => {
    let configurationError = '';
    try {
      createService({ APP_ENCRYPTION_KEY: ENCRYPTION_KEY });
    } catch (error) {
      configurationError = JSON.stringify(error);
    }
    expect(configurationError).not.toContain(ENCRYPTION_KEY);

    const service = createService();
    const sealed = service.sealInitialOwnerInviteToken(binding());
    const rawToken = service.openInitialOwnerInviteToken(openInput(sealed));
    const input = openInput(sealed);
    input.secretCiphertext[20] ^= 1;
    let envelopeError = '';
    try {
      service.openInitialOwnerInviteToken(input);
    } catch (error) {
      envelopeError = JSON.stringify(error);
    }

    expect(envelopeError).not.toContain(rawToken);
    expect(envelopeError).not.toContain(sealed.tokenHash);
    expect(envelopeError).not.toContain(
      sealed.secretCiphertext.toString('base64url'),
    );
  });
});

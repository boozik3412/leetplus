import { ConfigService } from '@nestjs/config';
import { SecretEncryptionService } from './secret-encryption.service';

function createService(values: Record<string, string>) {
  return new SecretEncryptionService(new ConfigService(values));
}

describe('SecretEncryptionService key separation', () => {
  const piiKey = `pii_${'a'.repeat(44)}`;
  const integrationKey = `integration_${'b'.repeat(44)}`;

  it('writes integration credentials with the independent v2 key', () => {
    const service = createService({
      APP_ENCRYPTION_KEY: piiKey,
      INTEGRATION_ENCRYPTION_KEY: integrationKey,
    });

    const encrypted = service.encrypt('langame-api-key');

    expect(encrypted).toMatch(/^v2:/);
    expect(service.decrypt(encrypted)).toBe('langame-api-key');
    expect(() => service.decrypt(encrypted, 'pii')).toThrow(
      'Encrypted secret purpose is invalid',
    );
  });

  it('keeps PII and legacy v1 ciphertext readable with APP_ENCRYPTION_KEY', () => {
    const service = createService({
      APP_ENCRYPTION_KEY: piiKey,
      INTEGRATION_ENCRYPTION_KEY: integrationKey,
    });

    const legacyCiphertext = service.encrypt('79990001122', 'pii');

    expect(legacyCiphertext).toMatch(/^v1:/);
    expect(service.decrypt(legacyCiphertext, 'pii')).toBe('79990001122');
    expect(service.decrypt(legacyCiphertext)).toBe('79990001122');
  });

  it('does not fall back to the PII key for new integration writes in production', () => {
    const service = createService({
      NODE_ENV: 'production',
      APP_ENCRYPTION_KEY: piiKey,
    });

    expect(() => service.encrypt('langame-api-key')).toThrow(
      'INTEGRATION_ENCRYPTION_KEY is required in production',
    );
  });
});

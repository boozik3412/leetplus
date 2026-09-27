import crypto from 'node:crypto';
import { canonical, demand, digest } from './contract.mjs';

export const EXTERNAL_TENANT_ROOT_KEY = 'LANGAME_EXTERNAL_TENANT_APPROVAL_PUBLIC_KEY_SPKI_B64';
export const EXTERNAL_TENANT_ROOT_CONTRACT = 'LEETPLUS_EXTERNAL_TENANT_APPROVAL_ROOT_V1';

export function externalTenantPublicRoot(publicPem, expectedDerSha256) {
  demand(/^[a-f0-9]{64}$/.test(expectedDerSha256 ?? ''), 'External tenant public-root fingerprint must be exact DER SHA256');
  const key = crypto.createPublicKey(publicPem);
  demand(key.asymmetricKeyType === 'ed25519', 'External tenant approval root must be Ed25519 public-only');
  const der = key.export({ type: 'spki', format: 'der' });
  demand(der.length === 44 && digest(der) === expectedDerSha256, 'External tenant public-root DER provenance drift');
  return { [EXTERNAL_TENANT_ROOT_KEY]: der.toString('base64') };
}

export function validateExternalTenantApiProfile(bytes, publicPem, expectedDerSha256) {
  const expected = externalTenantPublicRoot(publicPem, expectedDerSha256), profile = JSON.parse(bytes);
  demand(profile && typeof profile === 'object' && !Array.isArray(profile) &&
    profile[EXTERNAL_TENANT_ROOT_KEY] === expected[EXTERNAL_TENANT_ROOT_KEY] &&
    !Object.hasOwn(profile, 'LANGAME_EXTERNAL_TENANT_APPROVAL_PUBLIC_KEY') &&
    !Object.keys(profile).some(key => /EXTERNAL.*(?:PRIVATE|SIGNING_KEY)/.test(key)), 'External tenant API root is not exact public-only DER SPKI');
  return { contract: EXTERNAL_TENANT_ROOT_CONTRACT, decision: 'PUBLIC_ONLY_PROFILE_BOUND',
    profileSha256: digest(bytes), publicDerSha256: expectedDerSha256,
    environmentField: EXTERNAL_TENANT_ROOT_KEY };
}

export function bindExternalTenantApiProfile(profile, publicPem, expectedDerSha256) {
  demand(profile && typeof profile === 'object' && !Array.isArray(profile) &&
    !Object.hasOwn(profile, EXTERNAL_TENANT_ROOT_KEY) && !Object.hasOwn(profile, 'LANGAME_EXTERNAL_TENANT_APPROVAL_PUBLIC_KEY'),
  'External tenant public root cannot silently replace an existing profile binding');
  const bytes = Buffer.from(canonical({ ...profile, ...externalTenantPublicRoot(publicPem, expectedDerSha256) }));
  validateExternalTenantApiProfile(bytes, publicPem, expectedDerSha256);
  return bytes;
}

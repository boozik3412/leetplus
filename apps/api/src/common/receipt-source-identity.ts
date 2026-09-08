import { createHash } from 'node:crypto';

const RECEIPT_SOURCE_IDENTITY_PREFIX = 'receipt-v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function receiptIdentityDigest(receiptId: string) {
  return sha256(receiptId.trim());
}

export function bindReceiptIdentityToSourceHash(
  receiptId: string | null,
  sourcePayloadHash: string | null,
) {
  const normalizedReceiptId = receiptId?.trim();

  if (!normalizedReceiptId) {
    return sourcePayloadHash;
  }

  const normalizedPayloadHash =
    sourcePayloadHash && SHA256_PATTERN.test(sourcePayloadHash)
      ? sourcePayloadHash
      : sha256(sourcePayloadHash ?? '');

  return `${RECEIPT_SOURCE_IDENTITY_PREFIX}:${receiptIdentityDigest(normalizedReceiptId)}:${normalizedPayloadHash}`;
}

export function receiptIdentityFromSourceHash(
  sourcePayloadHash: string | null | undefined,
) {
  if (!sourcePayloadHash) {
    return null;
  }

  const [prefix, receiptDigest, payloadDigest, ...extra] =
    sourcePayloadHash.split(':');

  if (
    prefix !== RECEIPT_SOURCE_IDENTITY_PREFIX ||
    !SHA256_PATTERN.test(receiptDigest ?? '') ||
    !SHA256_PATTERN.test(payloadDigest ?? '') ||
    extra.length > 0
  ) {
    return null;
  }

  return receiptDigest;
}

export function receiptIdentitySourcePrefix(receiptId: string) {
  return `${RECEIPT_SOURCE_IDENTITY_PREFIX}:${receiptIdentityDigest(receiptId)}:`;
}

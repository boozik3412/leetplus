const MAX_EMAIL_LENGTH = 320;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 253;
const LOCAL_PART_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/u;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

/**
 * Accepts one already-canonicalized ASCII mailbox only. Address lists,
 * display-name syntax and quoted mailboxes are intentionally unsupported.
 */
export function isCanonicalIdentityEmail(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length < 3 ||
    value.length > MAX_EMAIL_LENGTH ||
    value !== value.trim() ||
    value !== value.toLowerCase() ||
    !/^[!-~]+$/u.test(value)
  ) {
    return false;
  }

  const atIndex = value.indexOf('@');
  if (
    atIndex < 1 ||
    atIndex !== value.lastIndexOf('@') ||
    atIndex > MAX_LOCAL_PART_LENGTH
  ) {
    return false;
  }

  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (
    domain.length < 3 ||
    domain.length > MAX_DOMAIN_LENGTH ||
    !LOCAL_PART_PATTERN.test(localPart) ||
    localPart.startsWith('.') ||
    localPart.endsWith('.') ||
    localPart.includes('..')
  ) {
    return false;
  }

  const labels = domain.split('.');
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        DOMAIN_LABEL_PATTERN.test(label),
    )
  );
}

import { isCanonicalIdentityEmail } from '../utilities/canonical-identity-email';

/**
 * Accepts one already-canonicalized ASCII mailbox only. In particular this
 * rejects Nodemailer address lists, display-name syntax and quoted mailboxes.
 */
export function isCanonicalIdentityMailRecipient(
  value: unknown,
): value is string {
  return isCanonicalIdentityEmail(value);
}

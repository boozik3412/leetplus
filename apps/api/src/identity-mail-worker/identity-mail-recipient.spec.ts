import { isCanonicalIdentityMailRecipient } from './identity-mail-recipient';

const LOCAL_64 = 'l'.repeat(64);
const LOCAL_65 = 'l'.repeat(65);
const LABEL_63 = 'd'.repeat(63);
const LABEL_64 = 'd'.repeat(64);
const DOMAIN_253 = [63, 63, 63, 61]
  .map((length) => 'd'.repeat(length))
  .join('.');
const DOMAIN_254 = [63, 63, 63, 62]
  .map((length) => 'd'.repeat(length))
  .join('.');
const DOMAIN_256 = [63, 63, 63, 61, 2]
  .map((length) => 'd'.repeat(length))
  .join('.');

describe('isCanonicalIdentityMailRecipient', () => {
  it.each([
    ['canonical mailbox', 'owner@example.test'],
    ['plus address', 'owner+beta@example.test'],
    ['dotted local and hyphenated subdomain', 'first.last@sub-domain.example'],
    ['numeric top-level label', 'owner@example.123'],
    ['64-byte local part', `${LOCAL_64}@example.test`],
    ['63-byte domain label', `owner@${LABEL_63}.test`],
    ['253-byte domain', `owner@${DOMAIN_253}`],
  ])('accepts %s', (_label, recipient) => {
    expect(isCanonicalIdentityMailRecipient(recipient)).toBe(true);
  });

  it.each([
    ['address list', 'owner@example.test,attacker@example.test'],
    ['semicolon-delimited list', 'owner@example.test;attacker@example.test'],
    ['display name', 'Owner <owner@example.test>'],
    ['quoted display name', '"Owner" <owner@example.test>'],
    ['quoted local part', '"owner"@example.test'],
    [
      'CRLF header injection',
      'owner@example.test\r\nBcc:attacker@example.test',
    ],
    ['line feed', 'owner@example.test\n'],
    ['tab', 'owner\t@example.test'],
    ['non-breaking space', 'owner\u00a0@example.test'],
    ['Unicode', 'владелец@example.test'],
    ['uppercase', 'Owner@example.test'],
    ['leading ASCII space', ' owner@example.test'],
    ['trailing ASCII space', 'owner@example.test '],
    ['multiple at signs', 'owner@@example.test'],
    ['leading local dot', '.owner@example.test'],
    ['trailing local dot', 'owner.@example.test'],
    ['consecutive local dots', 'owner..beta@example.test'],
    ['leading domain hyphen', 'owner@-example.test'],
    ['trailing domain hyphen', 'owner@example-.test'],
    ['empty domain label', 'owner@example..test'],
    ['invalid domain character', 'owner@example_test'],
    ['65-byte local part', `${LOCAL_65}@example.test`],
    ['64-byte domain label', `owner@${LABEL_64}.test`],
    ['254-byte domain', `owner@${DOMAIN_254}`],
    ['321-byte mailbox', `${LOCAL_64}@${DOMAIN_256}`],
  ])('rejects %s', (_label, recipient) => {
    expect(isCanonicalIdentityMailRecipient(recipient)).toBe(false);
  });
});

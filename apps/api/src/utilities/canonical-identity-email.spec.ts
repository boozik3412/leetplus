import { isCanonicalIdentityEmail } from './canonical-identity-email';

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
const TOTAL_321 = `${LOCAL_64}@${DOMAIN_256}`;

describe('isCanonicalIdentityEmail', () => {
  it.each([
    ['canonical mailbox', 'owner@example.test'],
    ['plus address', 'owner+beta@example.test'],
    ['dotted local and hyphenated subdomain', 'first.last@sub-domain.example'],
    ['numeric top-level label', 'owner@example.123'],
    ['64-byte local part', `${LOCAL_64}@example.test`],
    ['63-byte domain label', `owner@${LABEL_63}.test`],
    ['253-byte domain', `owner@${DOMAIN_253}`],
  ])('accepts %s', (_label, email) => {
    expect(isCanonicalIdentityEmail(email)).toBe(true);
  });

  it.each([
    ['address list', 'owner@example.test,attacker@example.test'],
    ['display name', 'Owner <owner@example.test>'],
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
    ['leading local dot', '.owner@example.test'],
    ['trailing local dot', 'owner.@example.test'],
    ['consecutive local dots', 'owner..beta@example.test'],
    ['leading domain hyphen', 'owner@-example.test'],
    ['trailing domain hyphen', 'owner@example-.test'],
    ['empty domain label', 'owner@example..test'],
    ['65-byte local part', `${LOCAL_65}@example.test`],
    ['64-byte domain label', `owner@${LABEL_64}.test`],
    ['254-byte domain', `owner@${DOMAIN_254}`],
    ['321-byte mailbox', TOTAL_321],
  ])('rejects %s', (_label, email) => {
    expect(isCanonicalIdentityEmail(email)).toBe(false);
  });

  it('pins the length-boundary fixtures', () => {
    expect(LOCAL_64).toHaveLength(64);
    expect(LOCAL_65).toHaveLength(65);
    expect(LABEL_63).toHaveLength(63);
    expect(LABEL_64).toHaveLength(64);
    expect(DOMAIN_253).toHaveLength(253);
    expect(DOMAIN_254).toHaveLength(254);
    expect(TOTAL_321).toHaveLength(321);
  });
});

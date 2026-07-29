import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ALLOWED_IMPLEMENTATION = 'auth/identity-email-claim.service.ts';
const FORBIDDEN_BOUNDARY_REFERENCES = [
  '.identityEmailClaim',
  'identity_email_claim_lock_v1',
  'identity_email_claim_reserve_invite_v1',
  'identity_email_claim_assert_invite_v1',
  'identity_email_claim_transition_v1',
  'identity_email_claim_release_v1',
] as const;

describe('Identity email claim application boundary', () => {
  it('keeps all claim table and RPC access inside the sealed service', async () => {
    const sourceRoot = join(__dirname, '..');
    const files = await typescriptFiles(sourceRoot);
    const violations: string[] = [];

    for (const file of files) {
      const path = relative(sourceRoot, file).replaceAll('\\', '/');
      if (path === ALLOWED_IMPLEMENTATION || path.endsWith('.spec.ts')) {
        continue;
      }
      const source = await readFile(file, 'utf8');
      for (const reference of FORBIDDEN_BOUNDARY_REFERENCES) {
        if (source.includes(reference)) {
          violations.push(`${path}:${reference}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await typescriptFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}

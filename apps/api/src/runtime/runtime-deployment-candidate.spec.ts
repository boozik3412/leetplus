import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const candidateRoot = resolve(
  __dirname,
  '../../../../docs/deployment/guest-runtime-pool-candidate',
);

function candidateFile(relativePath: string): string {
  return readFileSync(resolve(candidateRoot, relativePath), 'utf8');
}

describe('split runtime deployment candidate', () => {
  it('uses separate entrypoints, identities, env files and resource slices', () => {
    const corporate = candidateFile('systemd/leetplus-api-corporate@.service');
    const guest = candidateFile('systemd/leetplus-api-guest@.service');

    expect(corporate).toContain('User=leetplus-api-corporate-%i');
    expect(corporate).toContain('Slice=leetplus-corporate.slice');
    expect(corporate).toContain(
      'EnvironmentFile=/etc/leetplus/corporate-runtime.env',
    );
    expect(corporate).toContain('dist/corporate-main.js');
    expect(corporate).not.toContain('dist/guest-main.js');

    expect(guest).toContain('User=leetplus-api-guest-%i');
    expect(guest).toContain('Slice=leetplus-guest.slice');
    expect(guest).toContain('EnvironmentFile=/etc/leetplus/guest-runtime.env');
    expect(guest).toContain('dist/guest-main.js');
    expect(guest).not.toContain('dist/corporate-main.js');
  });

  it('pins distinct slot ports and keeps the guest scheduler disabled last', () => {
    expect(candidateFile('systemd/blue.corporate.env.example')).toContain(
      'CORPORATE_API_PORT=4100',
    );
    expect(candidateFile('systemd/blue.guest.env.example')).toContain(
      'GUEST_API_PORT=4101',
    );
    expect(candidateFile('systemd/green.corporate.env.example')).toContain(
      'CORPORATE_API_PORT=4200',
    );
    expect(candidateFile('systemd/green.guest.env.example')).toContain(
      'GUEST_API_PORT=4201',
    );

    const safety = candidateFile('systemd/guest-runtime-safety.env.example');
    expect(safety).toContain('LEETPLUS_API_RUNTIME_ROLE=GUEST');
    expect(safety).toContain('GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED=false');
  });

  it('routes only the exact public guest prefixes to the guest upstream', () => {
    const routes = candidateFile('nginx/split-api-server-routes.conf.example');

    expect(routes).toMatch(
      /location = \/guest-portal \{[\s\S]*?proxy_pass http:\/\/leetplus_guest_api;/,
    );
    expect(routes).toMatch(
      /location \^~ \/guest-portal\/ \{[\s\S]*?proxy_pass http:\/\/leetplus_guest_api;/,
    );
    expect(routes).toMatch(
      /location \^~ \/public\/guest-game\/media\/ \{[\s\S]*?proxy_pass http:\/\/leetplus_guest_api;/,
    );
    expect(routes).toMatch(
      /location \/ \{[\s\S]*?proxy_pass http:\/\/leetplus_api;/,
    );
    expect(routes).not.toMatch(/backup;/);
  });

  it('keeps the candidate explicitly dormant until control-plane admission', () => {
    const readme = candidateFile('README.md');

    expect(readme).toContain('DORMANT / NOT INSTALLED');
    expect(readme).toContain('production-control install map');
    expect(readme).toContain('явное production GO');
  });
});

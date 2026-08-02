import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_AUTH_CONTROLLER = resolve(__dirname, 'auth.controller.ts');
const API_MAIN = resolve(__dirname, '../main.ts');
const API_BODY_LIMIT = resolve(__dirname, 'invite-secret-body-limit.ts');
const API_USERS_SERVICE = resolve(__dirname, '../users/users.service.ts');
const API_USERS_CONTROLLER = resolve(
  __dirname,
  '../users/users.controller.ts',
);
const WEB_ROOT = resolve(__dirname, '../../../web/src');
const WEB_REGISTER_PAGE = resolve(WEB_ROOT, 'app/(auth)/register/page.tsx');
const WEB_AUTH_FORM = resolve(WEB_ROOT, 'components/auth-form.tsx');
const WEB_GATE = resolve(
  WEB_ROOT,
  'components/invite-registration-gate.tsx',
);
const WEB_PREVIEW_ROUTE = resolve(
  WEB_ROOT,
  'app/api/auth/invites/preview/route.ts',
);
const WEB_ACCEPT_ROUTE = resolve(
  WEB_ROOT,
  'app/api/auth/invites/accept/route.ts',
);
const WEB_TRANSPORT_CORE = resolve(
  WEB_ROOT,
  'lib/invite-transport-core.mts',
);
const WEB_PROXY = resolve(WEB_ROOT, 'lib/proxy.ts');
const WEB_INTERNAL_INVITE_ROUTE = resolve(
  WEB_ROOT,
  'app/api/users/invites/route.ts',
);
const WEB_INTERNAL_INVITE_ID_ROUTE = resolve(
  WEB_ROOT,
  'app/api/users/invites/[id]/route.ts',
);
const LEGACY_WEB_PREVIEW_ROUTE = resolve(
  WEB_ROOT,
  'app/api/auth/invites/[token]/route.ts',
);
const LEGACY_WEB_ACCEPT_ROUTE = resolve(
  WEB_ROOT,
  'app/api/auth/invites/[token]/accept/route.ts',
);

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('INVITE_SECRET_TRANSPORT_V1 source boundary', () => {
  it('has no API or BFF invite token path routes', () => {
    const controller = source(API_AUTH_CONTROLLER);
    const main = source(API_MAIN);
    const bodyLimit = source(API_BODY_LIMIT);
    expect(controller).toContain("@Post('invites/preview')");
    expect(controller).toContain("@Post('invites/accept')");
    expect(controller).toContain("'application/json'");
    expect(controller).not.toMatch(/invites\/:token/u);
    expect(controller).not.toMatch(/@Param\(['"]token['"]\)/u);
    expect(main).toContain(
      "app.use('/auth/invites/preview', inviteSecretJsonParser())",
    );
    expect(main).toContain(
      "app.use('/auth/invites/accept', inviteSecretJsonParser())",
    );
    expect(main).toContain(
      "app.use('/auth/invites/preview', inviteSecretParserErrorHandler())",
    );
    expect(main).toContain(
      "app.use('/auth/invites/accept', inviteSecretParserErrorHandler())",
    );
    expect(main).toContain(
      "app.use('/auth/invites/preview', inviteSecretContentTypeGuard())",
    );
    expect(main).toContain(
      "app.use('/auth/invites/accept', inviteSecretContentTypeGuard())",
    );
    expect(bodyLimit).toContain("INVITE_SECRET_REQUEST_LIMIT = '4kb'");
    expect(bodyLimit).toContain('INVITE_REQUEST_BODY_INVALID');
    expect(existsSync(LEGACY_WEB_PREVIEW_ROUTE)).toBe(false);
    expect(existsSync(LEGACY_WEB_ACCEPT_ROUTE)).toBe(false);
  });

  it('builds only a fragment delivery URL', () => {
    const usersService = source(API_USERS_SERVICE);
    expect(usersService).toContain('/register#invite=${token}');
    expect(usersService).not.toMatch(/\/register\?invite=/u);
  });

  it('never reads an invite from server search params', () => {
    const registerPage = source(WEB_REGISTER_PAGE);
    expect(registerPage).toContain('<InviteRegistrationGate />');
    expect(registerPage).not.toMatch(/searchParams/u);
    expect(registerPage).not.toMatch(/redirectIfAuthenticated/u);
  });

  it('scrubs the fragment before session or preview requests', () => {
    const gate = source(WEB_GATE);
    const scrub = gate.indexOf('window.history.replaceState');
    const sessionRequest = gate.indexOf('fetch("/api/auth/me"');
    expect(gate).toContain('capturedTokenRef.current === undefined');
    expect(scrub).toBeGreaterThan(-1);
    expect(sessionRequest).toBeGreaterThan(scrub);
    expect(gate).not.toMatch(/localStorage|sessionStorage|document\.cookie/u);
  });

  it('uses fixed same-origin POST endpoints and body forwarding', () => {
    const authForm = source(WEB_AUTH_FORM);
    const previewRoute = source(WEB_PREVIEW_ROUTE);
    const acceptRoute = source(WEB_ACCEPT_ROUTE);
    expect(authForm).toContain('fetch("/api/auth/invites/preview"');
    expect(authForm).toContain('"/api/auth/invites/accept"');
    expect(authForm).toContain('body: JSON.stringify({ token: inviteToken })');
    expect(authForm).not.toMatch(/encodeURIComponent\(inviteToken/u);
    expect(previewRoute).toContain('/auth/invites/preview');
    expect(acceptRoute).toContain('/auth/invites/accept');
    expect(previewRoute).not.toMatch(/auth\/invites\/\$\{/u);
    expect(acceptRoute).not.toMatch(/auth\/invites\/\$\{/u);
    expect(previewRoute).toContain('projectInvitePreview');
  });

  it('streams a bounded BFF body and marks INTERNAL secret responses no-store', () => {
    const core = source(WEB_TRANSPORT_CORE);
    const usersController = source(API_USERS_CONTROLLER);
    const proxy = source(WEB_PROXY);
    const createRoute = source(WEB_INTERNAL_INVITE_ROUTE);
    const updateRoute = source(WEB_INTERNAL_INVITE_ID_ROUTE);
    expect(core).toContain('request.body.getReader()');
    expect(core).not.toContain('request.text()');
    expect(core).toContain('MAX_INVITE_REQUEST_BYTES');
    expect(usersController).toContain(
      "@Header('Cache-Control', 'private, no-store, max-age=0')",
    );
    expect(proxy).toContain('PRIVATE_JSON_RESPONSE_HEADERS');
    expect(createRoute).toContain('privateNoStore: true');
    expect(updateRoute).toContain('privateNoStore: true');
  });
});

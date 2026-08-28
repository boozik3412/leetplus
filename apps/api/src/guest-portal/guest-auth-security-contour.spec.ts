import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourcePath = (relative: string) => resolve(process.cwd(), relative);

describe('guest authentication security contour', () => {
  it('does not consume the corporate JWT provider graph directly', () => {
    const moduleSource = readFileSync(
      sourcePath('src/guest-portal/guest-portal.module.ts'),
      'utf8',
    );
    const controllerSource = readFileSync(
      sourcePath('src/guest-portal/guest-portal.controller.ts'),
      'utf8',
    );

    expect(moduleSource).toContain('JwtModule.register({})');
    expect(moduleSource).not.toContain("from '../auth/auth.module'");
    expect(moduleSource).not.toContain('AuthModule,');
    expect(controllerSource).not.toContain('JwtAuthGuard');
    expect(controllerSource).not.toContain('@UseGuards');
  });

  it('keeps corporate and guest modules as sibling application contours', () => {
    const appModuleSource = readFileSync(
      sourcePath('src/app.module.ts'),
      'utf8',
    );

    expect(appModuleSource).toContain('AuthModule');
    expect(appModuleSource).toContain('GuestPortalModule');
  });
});

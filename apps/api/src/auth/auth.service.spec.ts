import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';

type PrismaMock = {
  user: {
    findUnique: jest.Mock;
  };
  tenant: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
};

type PasswordMock = {
  hash: jest.Mock;
  verify: jest.Mock;
};

type JwtMock = {
  signAsync: jest.Mock;
};

type EmailVerificationMock = {
  sendVerificationEmail: jest.Mock;
  confirmEmail: jest.Mock;
  resendByEmail: jest.Mock;
};

function createUserWithTenant() {
  return {
    id: 'user-1',
    email: 'owner@club-a.leetplus.ru',
    fullName: 'Owner',
    role: UserRole.OWNER,
    passwordHash: 'hash',
    tenantId: 'tenant-1',
    tenant: {
      slug: 'club-a',
    },
  };
}

describe('AuthService', () => {
  let prisma: PrismaMock;
  let passwordService: PasswordMock;
  let jwtService: JwtMock;
  let emailVerificationService: EmailVerificationMock;
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    passwordService = {
      hash: jest.fn().mockResolvedValue('hash'),
      verify: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
    };
    emailVerificationService = {
      sendVerificationEmail: jest.fn(),
      confirmEmail: jest.fn(),
      resendByEmail: jest.fn(),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      passwordService,
      jwtService as unknown as JwtService,
      emailVerificationService as unknown as EmailVerificationService,
    );
  });

  it('registers owner, tenant and returns access token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.tenant.create.mockResolvedValue({
      id: 'tenant-1',
      slug: 'club-a',
      users: [createUserWithTenant()],
    });

    await expect(
      service.register({
        email: ' OWNER@CLUB-A.LEETPLUS.RU ',
        password: 'strong-password',
        organizationName: 'Club A',
        tenantSlug: ' Club-A ',
        fullName: 'Owner',
      }),
    ).resolves.toEqual({
      accessToken: 'signed-token',
      user: {
        id: 'user-1',
        email: 'owner@club-a.leetplus.ru',
        fullName: 'Owner',
        role: UserRole.OWNER,
        tenantId: 'tenant-1',
        tenantSlug: 'club-a',
      },
    });

    expect(prisma.tenant.create).toHaveBeenCalledWith({
      data: {
        name: 'Club A',
        slug: 'club-a',
        domain: 'club-a.leetplus.ru',
        users: {
          create: {
            email: 'owner@club-a.leetplus.ru',
            fullName: 'Owner',
            passwordHash: 'hash',
            role: UserRole.OWNER,
          },
        },
      },
      include: {
        users: true,
      },
    });
    expect(emailVerificationService.sendVerificationEmail).toHaveBeenCalledWith(
      'user-1',
      'owner@club-a.leetplus.ru',
    );
  });

  it('rejects duplicate email during registration', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(
      service.register({
        email: 'owner@example.com',
        password: 'strong-password',
        organizationName: 'Club A',
        tenantSlug: 'club-a',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects weak password during registration', async () => {
    await expect(
      service.register({
        email: 'owner@example.com',
        password: 'short',
        organizationName: 'Club A',
        tenantSlug: 'club-a',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('logs in with valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(createUserWithTenant());
    passwordService.verify.mockResolvedValue(true);

    await expect(
      service.login({
        email: 'owner@club-a.leetplus.ru',
        password: 'strong-password',
      }),
    ).resolves.toMatchObject({
      accessToken: 'signed-token',
      user: {
        id: 'user-1',
        tenantId: 'tenant-1',
      },
    });
  });

  it('rejects invalid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(createUserWithTenant());
    passwordService.verify.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'owner@club-a.leetplus.ru',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns current user by token subject', async () => {
    prisma.user.findUnique.mockResolvedValue(createUserWithTenant());

    await expect(service.me('user-1')).resolves.toMatchObject({
      id: 'user-1',
      email: 'owner@club-a.leetplus.ru',
      tenantSlug: 'club-a',
    });
  });

  it('confirms email by verification token', async () => {
    emailVerificationService.confirmEmail.mockResolvedValue({ ok: true });

    await expect(service.confirmEmail('token-1')).resolves.toEqual({
      ok: true,
    });
    expect(emailVerificationService.confirmEmail).toHaveBeenCalledWith(
      'token-1',
    );
  });

  it('resends verification email for normalized address', async () => {
    emailVerificationService.resendByEmail.mockResolvedValue({ ok: true });

    await expect(
      service.resendVerificationEmail(' OWNER@CLUB-A.LEETPLUS.RU '),
    ).resolves.toEqual({ ok: true });
    expect(emailVerificationService.resendByEmail).toHaveBeenCalledWith(
      'owner@club-a.leetplus.ru',
    );
  });
});

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { EmailVerificationService } from './email-verification.service';

type PrismaMock = {
  emailVerificationToken: {
    create: jest.Mock;
    delete: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

type MailMock = {
  sendEmailVerification: jest.Mock;
};

type CreateTokenCall = [
  {
    data: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    };
  },
];

function createPrismaMock(): PrismaMock {
  return {
    emailVerificationToken: {
      create: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

describe('EmailVerificationService', () => {
  let prisma: PrismaMock;
  let mailService: MailMock;
  let service: EmailVerificationService;

  beforeEach(() => {
    prisma = createPrismaMock();
    mailService = {
      sendEmailVerification: jest.fn(),
    };
    service = new EmailVerificationService(
      prisma as unknown as PrismaService,
      {
        get: jest.fn((key: string) => {
          if (key === 'WEB_URL') {
            return 'http://localhost:3000';
          }

          if (key === 'EMAIL_VERIFICATION_EXPIRES_MINUTES') {
            return '60';
          }

          return undefined;
        }),
      } as unknown as ConfigService,
      mailService as unknown as TransactionalMailService,
    );
  });

  it('creates hashed token and sends verification link', async () => {
    prisma.emailVerificationToken.create.mockResolvedValue({ id: 'token-1' });

    await service.sendVerificationEmail('user-1', 'owner@example.com');

    const [createArgs] = prisma.emailVerificationToken.create.mock
      .calls[0] as CreateTokenCall;

    expect(createArgs.data.userId).toBe('user-1');
    expect(createArgs.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createArgs.data.expiresAt).toBeInstanceOf(Date);
    expect(mailService.sendEmailVerification).toHaveBeenCalledWith(
      'owner@example.com',
      expect.stringContaining('http://localhost:3000/verify-email?token='),
    );
  });

  it('confirms valid token and consumes active tokens', async () => {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      user: { id: 'user-1' },
    });

    await expect(service.confirmEmail('raw-token')).resolves.toEqual({
      ok: true,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { emailVerifiedAt: expect.any(Date) as Date },
      }),
    );
    expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'token-1' },
        data: { consumedAt: expect.any(Date) as Date },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects expired token', async () => {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 60_000),
      consumedAt: null,
      user: { id: 'user-1' },
    });

    await expect(service.confirmEmail('raw-token')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

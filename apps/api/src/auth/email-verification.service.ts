import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionalMailService } from '../mail/transactional-mail.service';

const DEFAULT_EXPIRES_MINUTES = 60;

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: TransactionalMailService,
  ) {}

  async sendVerificationEmail(userId: string, email: string) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.getExpiresMs());

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    try {
      await this.mailService.sendEmailVerification(
        email,
        this.buildVerificationUrl(token),
      );
    } catch (error) {
      await this.prisma.emailVerificationToken.delete({
        where: { tokenHash },
      });

      throw new InternalServerErrorException(
        error instanceof Error
          ? `Failed to send verification email: ${error.message}`
          : 'Failed to send verification email',
      );
    }
  }

  async confirmEmail(token: string) {
    const normalizedToken = token?.trim();

    if (!normalizedToken) {
      throw new BadRequestException('Verification token is required');
    }

    const tokenHash = this.hashToken(normalizedToken);
    const verificationToken =
      await this.prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

    if (
      !verificationToken ||
      verificationToken.consumedAt ||
      verificationToken.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Verification token is invalid or expired');
    }

    const verifiedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerifiedAt: verifiedAt },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { consumedAt: verifiedAt },
      }),
      this.prisma.emailVerificationToken.updateMany({
        where: {
          userId: verificationToken.userId,
          consumedAt: null,
          id: { not: verificationToken.id },
        },
        data: { consumedAt: verifiedAt },
      }),
    ]);

    return { ok: true };
  }

  async resendByEmail(email: string) {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    if (!user || user.emailVerifiedAt) {
      return { ok: true };
    }

    await this.sendVerificationEmail(user.id, user.email);
    return { ok: true };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private getExpiresMs() {
    const minutes = Number(
      this.configService.get<string>('EMAIL_VERIFICATION_EXPIRES_MINUTES') ??
        DEFAULT_EXPIRES_MINUTES,
    );

    return (
      (Number.isFinite(minutes) ? minutes : DEFAULT_EXPIRES_MINUTES) * 60_000
    );
  }

  private buildVerificationUrl(token: string) {
    const webUrl =
      this.configService.get<string>('WEB_URL') ?? 'http://localhost:3000';
    const url = new URL('/verify-email', webUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }
}

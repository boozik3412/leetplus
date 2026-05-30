import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthenticatedUser, AuthTokenPayload } from './auth.types';
import { resolveUserCapabilities } from './capabilities';
import { EmailVerificationService } from './email-verification.service';
import { PasswordService } from './password.service';

type AuthResponse = {
  accessToken: string;
  user: AuthenticatedUser;
};

type UserWithTenant = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  customRoleId: string | null;
  isActive: boolean;
  isPlatformAdmin: boolean;
  passwordHash: string;
  tenantId: string;
  tenant: {
    slug: string;
  };
  customRole?: {
    id: string;
    name: string;
    permissions: string[];
  } | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto.email);
    const tenantSlug = this.normalizeTenantSlug(dto.tenantSlug);
    const organizationName = dto.organizationName?.trim();
    const fullName = dto.fullName?.trim() || null;

    this.assertEmail(email);
    this.assertPassword(dto.password);
    this.assertTenantSlug(tenantSlug);

    if (!organizationName) {
      throw new BadRequestException('Organization name is required');
    }

    const [existingUser, existingTenant] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.tenant.findUnique({ where: { slug: tenantSlug } }),
    ]);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (existingTenant) {
      throw new ConflictException('Tenant slug is already taken');
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: organizationName,
        slug: tenantSlug,
        domain: `${tenantSlug}.leetplus.ru`,
        users: {
          create: {
            email,
            fullName,
            passwordHash,
            role: UserRole.OWNER,
          },
        },
      },
      include: {
        users: true,
      },
    });

    const owner = tenant.users[0];

    if (!owner) {
      throw new BadRequestException('Failed to create organization owner');
    }

    await this.emailVerificationService.sendVerificationEmail(
      owner.id,
      owner.email,
    );

    return this.createAuthResponse({
      id: owner.id,
      email: owner.email,
      fullName: owner.fullName,
      role: owner.role,
      customRoleId: null,
      customRole: null,
      isActive: owner.isActive,
      isPlatformAdmin: owner.isPlatformAdmin,
      passwordHash: owner.passwordHash,
      tenantId: owner.tenantId,
      tenant: {
        slug: tenant.slug,
      },
    });
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(dto?.email);
    this.assertEmail(email);
    this.assertPassword(dto?.password);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        tenant: {
          select: {
            slug: true,
          },
        },
        customRole: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    const isPasswordValid = await this.passwordService.verify(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createAuthResponse(user);
  }

  async me(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: {
          select: {
            slug: true,
          },
        },
        customRole: {
          select: {
            id: true,
            name: true,
            permissions: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    return this.toAuthenticatedUser(user);
  }

  confirmEmail(token: string) {
    return this.emailVerificationService.confirmEmail(token);
  }

  resendVerificationEmail(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    this.assertEmail(normalizedEmail);
    return this.emailVerificationService.resendByEmail(normalizedEmail);
  }

  private async createAuthResponse(
    user: UserWithTenant,
  ): Promise<AuthResponse> {
    const authenticatedUser = this.toAuthenticatedUser(user);
    const payload: AuthTokenPayload = {
      sub: authenticatedUser.id,
      email: authenticatedUser.email,
      role: authenticatedUser.role,
      customRoleId: authenticatedUser.customRoleId,
      permissions: authenticatedUser.permissions,
      isPlatformAdmin: authenticatedUser.isPlatformAdmin,
      tenantId: authenticatedUser.tenantId,
      tenantSlug: authenticatedUser.tenantSlug,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: authenticatedUser,
    };
  }

  private toAuthenticatedUser(user: UserWithTenant): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      customRoleId: user.customRole?.id ?? user.customRoleId ?? null,
      customRoleName: user.customRole?.name ?? null,
      permissions: resolveUserCapabilities(user),
      isActive: user.isActive,
      isPlatformAdmin: user.isPlatformAdmin,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
    };
  }

  private normalizeEmail(email: unknown): string {
    if (typeof email !== 'string') {
      return '';
    }

    return email.trim().toLowerCase();
  }

  private normalizeTenantSlug(tenantSlug: unknown): string {
    if (typeof tenantSlug !== 'string') {
      return '';
    }

    return tenantSlug.trim().toLowerCase();
  }

  private assertEmail(email: string): void {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Valid email is required');
    }
  }

  private assertPassword(password: unknown): asserts password is string {
    if (typeof password !== 'string' || password.length < 8) {
      throw new BadRequestException(
        'Password must contain at least 8 characters',
      );
    }
  }

  private assertTenantSlug(tenantSlug: string): void {
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(tenantSlug)) {
      throw new BadRequestException(
        'Tenant slug must be 3-32 lowercase letters, numbers or hyphens',
      );
    }
  }
}

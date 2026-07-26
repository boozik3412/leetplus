import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { PlatformAdminGuard } from './platform-admin.guard';
import { RolesGuard } from './roles.guard';
import { StrictRolesGuard } from './strict-roles.guard';
import { resolveSecuritySecret } from '../config/environment-validation';

type JwtExpiresIn = NonNullable<JwtModuleOptions['signOptions']>['expiresIn'];

@Module({
  imports: [
    ConfigModule,
    MailModule,
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: resolveSecuritySecret(configService, 'JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ??
            '24h') as JwtExpiresIn,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailVerificationService,
    PasswordService,
    PlatformAdminGuard,
    JwtAuthGuard,
    RolesGuard,
    StrictRolesGuard,
  ],
  exports: [
    AuthService,
    JwtModule,
    JwtAuthGuard,
    PlatformAdminGuard,
    PasswordService,
    RolesGuard,
    StrictRolesGuard,
  ],
})
export class AuthModule {}

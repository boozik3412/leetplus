import { MailerModule } from '@nestjs-modules/mailer';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TransactionalMailService } from './transactional-mail.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('MAIL_HOST') ?? 'localhost';
        const port = Number(configService.get<string>('MAIL_PORT') ?? 1025);
        const secure = configService.get<string>('MAIL_SECURE') === 'true';
        const user = configService.get<string>('MAIL_USER') ?? '';
        const pass = configService.get<string>('MAIL_PASS') ?? '';

        return {
          transport: {
            host,
            port,
            secure,
            ...(user && pass
              ? {
                  auth: {
                    user,
                    pass,
                  },
                }
              : {}),
          },
          defaults: {
            from:
              configService.get<string>('MAIL_FROM') ??
              'LeetPlus <no-reply@leetplus.ru>',
          },
        };
      },
    }),
  ],
  providers: [TransactionalMailService],
  exports: [TransactionalMailService],
})
export class MailModule {}

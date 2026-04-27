import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TransactionalMailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendEmailVerification(to: string, verificationUrl: string) {
    await this.mailerService.sendMail({
      to,
      subject: 'Подтверждение регистрации в LeetPlus',
      text: [
        'Здравствуйте!',
        '',
        'Подтвердите email для завершения регистрации в LeetPlus:',
        verificationUrl,
        '',
        'Если вы не регистрировались в LeetPlus, просто проигнорируйте это письмо.',
      ].join('\n'),
      html: [
        '<p>Здравствуйте!</p>',
        '<p>Подтвердите email для завершения регистрации в LeetPlus.</p>',
        `<p><a href="${verificationUrl}">Подтвердить email</a></p>`,
        '<p>Если вы не регистрировались в LeetPlus, просто проигнорируйте это письмо.</p>',
      ].join(''),
    });
  }
}

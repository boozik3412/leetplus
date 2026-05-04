import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

export type MailAttachment = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

export type ReportEmailContext = {
  tenantSlug: string;
  from: string;
  to: string;
  attachment: MailAttachment;
};

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

  async sendReportExport(to: string, context: ReportEmailContext) {
    await this.mailerService.sendMail({
      to,
      subject: `Сводный отчёт LeetPlus ${context.from} - ${context.to}`,
      text: [
        'Здравствуйте!',
        '',
        `Во вложении сводный отчёт LeetPlus по организации ${context.tenantSlug}.`,
        `Период: ${context.from} - ${context.to}.`,
        '',
        'Файл включает операционную сводку, рекомендации, OOS, товары без продаж, остатки, ABC, ТОП SKU/поставщиков и ассортимент.',
        '',
        'Письмо сформировано автоматически.',
      ].join('\n'),
      html: [
        '<p>Здравствуйте!</p>',
        `<p>Во вложении сводный отчёт LeetPlus по организации <b>${context.tenantSlug}</b>.</p>`,
        `<p>Период: ${context.from} - ${context.to}.</p>`,
        '<p>Файл включает операционную сводку, рекомендации, OOS, товары без продаж, остатки, ABC, ТОП SKU/поставщиков и ассортимент.</p>',
        '<p>Письмо сформировано автоматически.</p>',
      ].join(''),
      attachments: [
        {
          filename: context.attachment.fileName,
          content: context.attachment.buffer,
          contentType: context.attachment.contentType,
        },
      ],
    });
  }
}

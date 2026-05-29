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

export type ReportDigestContext = {
  type: 'DAILY' | 'WEEKLY';
  tenantSlug: string;
  from: string;
  to: string;
  headline: string;
  metrics: {
    label: string;
    value: string;
    delta?: string | null;
  }[];
  actions: string[];
  attachment?: MailAttachment;
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

  async sendReportDigest(to: string, context: ReportDigestContext) {
    const subjectPrefix =
      context.type === 'DAILY'
        ? 'Ежедневный дайджест'
        : 'Еженедельный коммерческий отчет';
    const lines = [
      'Здравствуйте!',
      '',
      `${subjectPrefix} LeetPlus по организации ${context.tenantSlug}.`,
      `Период: ${context.from} - ${context.to}.`,
      '',
      context.headline,
      '',
      'Ключевые показатели:',
      ...context.metrics.map((metric) =>
        [
          `- ${metric.label}: ${metric.value}`,
          metric.delta ? ` (${metric.delta})` : '',
        ].join(''),
      ),
      '',
      'Что сделать:',
      ...(context.actions.length > 0
        ? context.actions.map((action) => `- ${action}`)
        : ['- Критичных действий по текущему периоду нет.']),
      '',
      'Письмо сформировано автоматически.',
    ];
    const htmlMetrics = context.metrics
      .map(
        (metric) =>
          `<li><b>${escapeHtml(metric.label)}:</b> ${escapeHtml(metric.value)}${
            metric.delta ? ` <span>${escapeHtml(metric.delta)}</span>` : ''
          }</li>`,
      )
      .join('');
    const htmlActions = (
      context.actions.length > 0
        ? context.actions
        : ['Критичных действий по текущему периоду нет.']
    )
      .map((action) => `<li>${escapeHtml(action)}</li>`)
      .join('');

    await this.mailerService.sendMail({
      to,
      subject: `${subjectPrefix} LeetPlus ${context.from} - ${context.to}`,
      text: lines.join('\n'),
      html: [
        '<p>Здравствуйте!</p>',
        `<p><b>${escapeHtml(subjectPrefix)} LeetPlus</b> по организации <b>${escapeHtml(context.tenantSlug)}</b>.</p>`,
        `<p>Период: ${escapeHtml(context.from)} - ${escapeHtml(context.to)}.</p>`,
        `<p>${escapeHtml(context.headline)}</p>`,
        '<p><b>Ключевые показатели</b></p>',
        `<ul>${htmlMetrics}</ul>`,
        '<p><b>Что сделать</b></p>',
        `<ul>${htmlActions}</ul>`,
        '<p>Письмо сформировано автоматически.</p>',
      ].join(''),
      attachments: context.attachment
        ? [
            {
              filename: context.attachment.fileName,
              content: context.attachment.buffer,
              contentType: context.attachment.contentType,
            },
          ]
        : undefined,
    });
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

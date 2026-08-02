import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import {
  inviteSecretContentTypeGuard,
  inviteSecretJsonParser,
  inviteSecretParserErrorHandler,
} from './auth/invite-secret-body-limit';
import { assertDesignPartnerDatabaseAdmission } from './config/design-partner-runtime-policy';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  await assertDesignPartnerDatabaseAdmission(
    app.get(PrismaService),
    app.get(ConfigService),
  );

  app.use('/auth/invites/preview', inviteSecretContentTypeGuard());
  app.use('/auth/invites/preview', inviteSecretJsonParser());
  app.use('/auth/invites/preview', inviteSecretParserErrorHandler());
  app.use('/auth/invites/accept', inviteSecretContentTypeGuard());
  app.use('/auth/invites/accept', inviteSecretJsonParser());
  app.use('/auth/invites/accept', inviteSecretParserErrorHandler());
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  app.enableCors({
    origin: ['http://localhost:3000'],
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 4000;
  await app.listen(port);

  console.log(`API is running on http://localhost:${port}`);
}

void bootstrap();

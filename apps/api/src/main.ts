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
import {
  API_BIND_HOST_KEY,
  PRODUCTION_API_BIND_HOST,
} from './config/environment-validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);
  await assertDesignPartnerDatabaseAdmission(
    app.get(PrismaService),
    configService,
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

  const port = configService.get<string>('PORT') ?? '4000';
  const host =
    configService.get<string>(API_BIND_HOST_KEY)?.trim() ||
    PRODUCTION_API_BIND_HOST;
  await app.listen(port, host);

  console.log(`API is running on http://${host}:${port}`);
}

void bootstrap();

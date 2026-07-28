import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { assertDesignPartnerDatabaseAdmission } from './config/design-partner-runtime-policy';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  await assertDesignPartnerDatabaseAdmission(
    app.get(PrismaService),
    app.get(ConfigService),
  );

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

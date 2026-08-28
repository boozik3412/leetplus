import type { INestApplication, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import {
  inviteSecretContentTypeGuard,
  inviteSecretJsonParser,
  inviteSecretParserErrorHandler,
} from '../auth/invite-secret-body-limit';
import { apiRuntimePerimeter } from '../config/api-runtime-perimeter';
import {
  API_RUNTIME_ROLE_KEY,
  type ApiRuntimeRole,
  resolveApiRuntimeRole,
} from '../config/api-runtime-role';
import { assertDesignPartnerDatabaseAdmission } from '../config/design-partner-runtime-policy';
import {
  API_BIND_HOST_KEY,
  PRODUCTION_API_BIND_HOST,
} from '../config/environment-validation';
import { PrismaService } from '../prisma/prisma.service';

export type ApiBootstrapOptions = {
  expectedRole: ApiRuntimeRole;
  portKey: 'PORT' | 'CORPORATE_API_PORT' | 'GUEST_API_PORT';
  defaultPort: string;
  inviteSecretTransport: boolean;
};

export async function bootstrapApiRuntime(
  rootModule: Type<unknown>,
  options: ApiBootstrapOptions,
): Promise<void> {
  assertEntrypointRole(process.env[API_RUNTIME_ROLE_KEY], options.expectedRole);

  const app = await NestFactory.create(rootModule, { bodyParser: false });
  try {
    const configService = app.get(ConfigService);
    const role = resolveApiRuntimeRole(
      configService.get<unknown>(API_RUNTIME_ROLE_KEY),
    );
    assertEntrypointRole(role, options.expectedRole);

    await assertDesignPartnerDatabaseAdmission(
      app.get(PrismaService),
      configService,
    );

    // Install the perimeter before every parser so denied surfaces cannot spend
    // CPU or memory parsing bodies in the wrong runtime.
    app.use(apiRuntimePerimeter(role));

    if (options.inviteSecretTransport) {
      installInviteSecretTransport(app);
    }

    app.use(json({ limit: '5mb' }));
    app.use(urlencoded({ extended: true, limit: '5mb' }));
    app.enableCors({
      origin: ['http://localhost:3000'],
      credentials: true,
    });
    app.enableShutdownHooks();

    const port =
      configService.get<string>(options.portKey)?.trim() || options.defaultPort;
    const host =
      configService.get<string>(API_BIND_HOST_KEY)?.trim() ||
      PRODUCTION_API_BIND_HOST;
    await app.listen(port, host);

    console.log(`${role} API is running on http://${host}:${port}`);
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
}

export function assertEntrypointRole(
  configuredRole: unknown,
  expectedRole: ApiRuntimeRole,
): void {
  const actualRole = resolveApiRuntimeRole(configuredRole);
  if (actualRole !== expectedRole) {
    throw new Error(
      `${expectedRole} API entrypoint cannot start with ${API_RUNTIME_ROLE_KEY}=${actualRole}`,
    );
  }
}

function installInviteSecretTransport(app: INestApplication): void {
  app.use('/auth/invites/preview', inviteSecretContentTypeGuard());
  app.use('/auth/invites/preview', inviteSecretJsonParser());
  app.use('/auth/invites/preview', inviteSecretParserErrorHandler());
  app.use('/auth/invites/accept', inviteSecretContentTypeGuard());
  app.use('/auth/invites/accept', inviteSecretJsonParser());
  app.use('/auth/invites/accept', inviteSecretParserErrorHandler());
}

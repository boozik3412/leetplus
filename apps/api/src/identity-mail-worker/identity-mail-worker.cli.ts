import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS } from '../auth/identity-mail-independent-secret-keys';
import { IdentityMailSecretEnvelopeService } from '../auth/identity-mail-secret-envelope.service';
import { loadIdentityMailWorkerConfig } from './identity-mail-worker.config';
import { IdentityMailWorkerHealthServer } from './identity-mail-worker-health';
import {
  IdentityMailWorkerRepositoryError,
  PrismaIdentityMailWorkerRepository,
} from './identity-mail-worker.repository';
import {
  IdentityMailSmtpProviderError,
  StrictIdentityMailSmtpProvider,
} from './identity-mail-smtp-provider';
import {
  IdentityMailWorkerProcessingError,
  IdentityMailWorkerService,
} from './identity-mail-worker.service';
import type {
  EnabledIdentityMailWorkerConfig,
  IdentityMailWorkerEnvironment,
  IdentityMailWorkerLogEvent,
  IdentityMailWorkerLogger,
} from './identity-mail-worker.types';
import { IdentityMailWorkerConfigurationError } from './identity-mail-worker.config';

type StopState = {
  requested: boolean;
  wake: (() => void) | null;
};

const safeLogger: IdentityMailWorkerLogger = {
  log: (event) => writeEvent('log', event),
  warn: (event) => writeEvent('warn', event),
  error: (event) => writeEvent('error', event),
};

export function createIdentityMailWorkerSecretOpener(
  config: EnabledIdentityMailWorkerConfig,
  environment: IdentityMailWorkerEnvironment,
): IdentityMailSecretEnvelopeService {
  const envelopeConfiguration: Record<string, unknown> = {
    IDENTITY_MAIL_ENCRYPTION_KEY: config.encryptionKey,
    IDENTITY_MAIL_ENCRYPTION_KEY_VERSION: config.encryptionKeyVersion,
    IDENTITY_MAIL_AAD_ENVIRONMENT: config.aadEnvironment,
  };
  for (const key of IDENTITY_MAIL_INDEPENDENT_SECRET_KEYS) {
    // ConfigService falls back to process.env only for undefined internal
    // values. A null sentinel makes the supplied environment authoritative.
    envelopeConfiguration[key] = environment[key] ?? null;
  }
  return new IdentityMailSecretEnvelopeService(
    new ConfigService(envelopeConfiguration),
  );
}

export async function runIdentityMailWorker(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = loadIdentityMailWorkerConfig(environment);
  if (!config.enabled) {
    writeEvent('log', { event: 'IDENTITY_MAIL_WORKER_DISABLED' });
    return;
  }

  const secretOpener = createIdentityMailWorkerSecretOpener(
    config,
    environment,
  );
  const prisma = new PrismaClient({
    datasourceUrl: config.databaseUrl,
    log: [],
  });
  const repository = new PrismaIdentityMailWorkerRepository(prisma);
  const smtpProvider = new StrictIdentityMailSmtpProvider(config.smtp);
  const worker = new IdentityMailWorkerService(
    config,
    repository,
    secretOpener,
    smtpProvider,
    safeLogger,
  );
  const health = new IdentityMailWorkerHealthServer(
    config.healthHost,
    config.healthPort,
    config.releaseSha,
  );
  const stopState: StopState = { requested: false, wake: null };
  const stop = () => {
    // Readiness stops immediately. runOnce stops before another claim, while
    // any lease already returned by claimOne is deliberately completed.
    health.failed('IDENTITY_MAIL_WORKER_STOPPING');
    stopState.requested = true;
    stopState.wake?.();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    await health.start();
    if (stopState.requested) {
      return;
    }
    await worker.assertReady();
    if (stopState.requested) {
      return;
    }
    health.ready();
    while (!stopState.requested) {
      await worker.runOnce(() => stopState.requested);
      await interruptibleDelay(config.pollIntervalMs, stopState);
    }
  } catch (error) {
    const reasonCode = safeReasonCode(error);
    health.failed(reasonCode);
    writeEvent('error', {
      event: 'IDENTITY_MAIL_WORKER_STOPPED',
      reasonCode,
    });
    throw new IdentityMailWorkerProcessingError(reasonCode);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await health.stop().catch(() => undefined);
    worker.close();
    await repository.disconnect().catch(() => undefined);
  }
}

function interruptibleDelay(
  durationMs: number,
  state: StopState,
): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.wake = null;
      resolve();
    }, durationMs);
    state.wake = () => {
      clearTimeout(timer);
      state.wake = null;
      resolve();
    };
  });
}

function safeReasonCode(error: unknown): string {
  if (
    error instanceof IdentityMailWorkerConfigurationError ||
    error instanceof IdentityMailWorkerRepositoryError ||
    error instanceof IdentityMailSmtpProviderError ||
    error instanceof IdentityMailWorkerProcessingError
  ) {
    return error.reasonCode;
  }
  return 'IDENTITY_MAIL_WORKER_FAILED';
}

function writeEvent(
  level: 'log' | 'warn' | 'error',
  event:
    | IdentityMailWorkerLogEvent
    | {
        event: 'IDENTITY_MAIL_WORKER_DISABLED' | 'IDENTITY_MAIL_WORKER_STOPPED';
        reasonCode?: string;
      },
): void {
  const payload = JSON.stringify(event);
  if (level === 'error') {
    console.error(payload);
  } else if (level === 'warn') {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}

if (require.main === module) {
  void runIdentityMailWorker().catch(() => {
    process.exitCode = 1;
  });
}

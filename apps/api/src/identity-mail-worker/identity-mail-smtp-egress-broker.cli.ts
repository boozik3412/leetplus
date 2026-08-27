import {
  IdentityMailSmtpEgressBrokerConfigurationError,
  loadIdentityMailSmtpEgressBrokerConfig,
} from './identity-mail-smtp-egress-broker.config';
import {
  IdentityMailSmtpEgressBroker,
  IdentityMailSmtpEgressBrokerError,
  type IdentityMailSmtpEgressBrokerLogEvent,
  type IdentityMailSmtpEgressBrokerLogger,
} from './identity-mail-smtp-egress-broker';

const logger: IdentityMailSmtpEgressBrokerLogger = {
  log: (event) => writeEvent('log', event),
  warn: (event) => writeEvent('warn', event),
  error: (event) => writeEvent('error', event),
};

export async function runIdentityMailSmtpEgressBroker(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = loadIdentityMailSmtpEgressBrokerConfig(environment);
  if (!config.enabled) {
    writeEvent('log', { event: 'IDENTITY_MAIL_SMTP_EGRESS_DISABLED' });
    return;
  }

  const broker = new IdentityMailSmtpEgressBroker(config, logger);
  let stopping = false;
  let resolveStop: (() => void) | null = null;
  const stopped = new Promise<void>((resolve) => {
    resolveStop = resolve;
  });
  const stop = () => {
    if (!stopping) {
      stopping = true;
      resolveStop?.();
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    await broker.start();
    await stopped;
  } catch (error) {
    const reasonCode = safeReasonCode(error);
    writeEvent('error', {
      event: 'IDENTITY_MAIL_SMTP_EGRESS_STOPPED',
      reasonCode,
    });
    throw new IdentityMailSmtpEgressBrokerError(reasonCode);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await broker.stop().catch(() => undefined);
  }
}

function safeReasonCode(error: unknown): string {
  if (
    error instanceof IdentityMailSmtpEgressBrokerConfigurationError ||
    error instanceof IdentityMailSmtpEgressBrokerError
  ) {
    return error.reasonCode;
  }
  return 'IDENTITY_MAIL_SMTP_EGRESS_FAILED';
}

function writeEvent(
  level: 'log' | 'warn' | 'error',
  event:
    | IdentityMailSmtpEgressBrokerLogEvent
    | { event: 'IDENTITY_MAIL_SMTP_EGRESS_DISABLED' },
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
  void runIdentityMailSmtpEgressBroker().catch(() => {
    process.exitCode = 1;
  });
}

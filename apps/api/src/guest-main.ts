import { API_RUNTIME_ROLE_KEY } from './config/api-runtime-role';
import { bootstrapApiRuntime } from './runtime/api-bootstrap';
import { GuestRuntimeModule } from './runtime/guest-runtime.module';

void bootstrapApiRuntime(GuestRuntimeModule, {
  expectedRole: 'GUEST',
  portKey: 'GUEST_API_PORT',
  defaultPort: '4001',
  inviteSecretTransport: false,
}).catch((error: unknown) => {
  console.error(
    `Guest API startup failed (${API_RUNTIME_ROLE_KEY}=GUEST required)`,
    error,
  );
  process.exitCode = 1;
});

import { API_RUNTIME_ROLE_KEY } from './config/api-runtime-role';
import { bootstrapApiRuntime } from './runtime/api-bootstrap';
import { CorporateRuntimeModule } from './runtime/corporate-runtime.module';

void bootstrapApiRuntime(CorporateRuntimeModule, {
  expectedRole: 'CORPORATE',
  portKey: 'CORPORATE_API_PORT',
  defaultPort: '4000',
  inviteSecretTransport: true,
}).catch((error: unknown) => {
  console.error(
    `Corporate API startup failed (${API_RUNTIME_ROLE_KEY}=CORPORATE required)`,
    error,
  );
  process.exitCode = 1;
});

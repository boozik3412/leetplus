import { AppModule } from './app.module';
import { bootstrapApiRuntime } from './runtime/api-bootstrap';

void bootstrapApiRuntime(AppModule, {
  expectedRole: 'COMBINED',
  portKey: 'PORT',
  defaultPort: '4000',
  inviteSecretTransport: true,
}).catch((error: unknown) => {
  console.error('Combined API startup failed', error);
  process.exitCode = 1;
});

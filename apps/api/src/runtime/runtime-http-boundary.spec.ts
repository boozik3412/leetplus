import { Test } from '@nestjs/testing';
import request from 'supertest';
import { apiRuntimePerimeter } from '../config/api-runtime-perimeter';
import { PrismaService } from '../prisma/prisma.service';
import { GuestRuntimeModule } from './guest-runtime.module';

describe('guest runtime HTTP boundary', () => {
  const originalRole = process.env.LEETPLUS_API_RUNTIME_ROLE;
  const originalScheduler =
    process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED;

  afterEach(() => {
    restoreEnvironment('LEETPLUS_API_RUNTIME_ROLE', originalRole);
    restoreEnvironment(
      'GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED',
      originalScheduler,
    );
  });

  it('serves guest health and rejects corporate/body surfaces first', async () => {
    process.env.LEETPLUS_API_RUNTIME_ROLE = 'GUEST';
    process.env.GUEST_GAME_BONUS_LEDGER_SCHEDULER_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({
      imports: [GuestRuntimeModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const app = moduleRef.createNestApplication({ bodyParser: false });
    app.use(apiRuntimePerimeter('GUEST'));
    await app.init();
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          ok: true,
          service: 'leetplus-api-guest',
        });
      });

    await request(httpServer)
      .post('/auth/login')
      .set('content-type', 'application/json')
      .send('not-json-and-must-not-be-parsed')
      .expect(404)
      .expect({ statusCode: 404, message: 'Not Found' });

    await request(httpServer)
      .get('/health/internal')
      .expect(404)
      .expect({ statusCode: 404, message: 'Not Found' });

    await app.close();
  });
});

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

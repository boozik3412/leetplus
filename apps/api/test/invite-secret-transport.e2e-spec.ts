import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthController } from '../src/auth/auth.controller';
import {
  inviteSecretContentTypeGuard,
  inviteSecretJsonParser,
  inviteSecretParserErrorHandler,
} from '../src/auth/invite-secret-body-limit';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

const INVITE_TOKEN = 'A'.repeat(43);

describe('INVITE_SECRET_TRANSPORT_V1 routes (e2e)', () => {
  let app: INestApplication<App>;
  const authService = {
    getInvite: jest.fn(),
    acceptInvite: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleFixture.createNestApplication();
    app.use('/auth/invites/preview', inviteSecretContentTypeGuard());
    app.use('/auth/invites/preview', inviteSecretJsonParser());
    app.use('/auth/invites/preview', inviteSecretParserErrorHandler());
    app.use('/auth/invites/accept', inviteSecretContentTypeGuard());
    app.use('/auth/invites/accept', inviteSecretJsonParser());
    app.use('/auth/invites/accept', inviteSecretParserErrorHandler());
    app.use(json({ limit: '5mb' }));
    app.use(urlencoded({ extended: true, limit: '5mb' }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('previews an invite through a fixed POST route and JSON body', async () => {
    authService.getInvite.mockResolvedValue({
      email: 'invitee@example.test',
      expiresAt: '2026-08-01T00:00:00.000Z',
    });

    const response = await request(app.getHttpServer())
      .post('/auth/invites/preview')
      .send({ token: INVITE_TOKEN })
      .expect('Cache-Control', 'private, no-store, max-age=0')
      .expect('Pragma', 'no-cache')
      .expect('Referrer-Policy', 'no-referrer')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(200);

    expect(response.body).toMatchObject({ email: 'invitee@example.test' });
    expect(JSON.stringify(response.body)).not.toContain(INVITE_TOKEN);
    expect(authService.getInvite).toHaveBeenCalledWith(INVITE_TOKEN);
  });

  it('accepts an invite through a fixed POST route and JSON body', async () => {
    authService.acceptInvite.mockResolvedValue({
      accessToken: 'signed-token',
      user: { id: 'invitee-user' },
    });
    const payload = {
      token: INVITE_TOKEN,
      password: 'strong-password',
      confirmPassword: 'strong-password',
    };

    const response = await request(app.getHttpServer())
      .post('/auth/invites/accept')
      .send(payload)
      .expect('Cache-Control', 'private, no-store, max-age=0')
      .expect('Pragma', 'no-cache')
      .expect('Referrer-Policy', 'no-referrer')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(200);

    expect(response.body).toMatchObject({ accessToken: 'signed-token' });
    expect(JSON.stringify(response.body)).not.toContain(INVITE_TOKEN);
    expect(authService.acceptInvite).toHaveBeenCalledWith(INVITE_TOKEN, payload);
  });

  it('does not route legacy bearer-token paths', async () => {
    await request(app.getHttpServer()).get('/auth/invites/preview').expect(404);
    await request(app.getHttpServer())
      .get(`/auth/invites/${INVITE_TOKEN}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/auth/invites/${INVITE_TOKEN}/accept`)
      .send({ password: 'strong-password' })
      .expect(404);
    expect(authService.getInvite).not.toHaveBeenCalled();
    expect(authService.acceptInvite).not.toHaveBeenCalled();
  });

  it('rejects non-JSON invite requests before service dispatch', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/invites/preview')
      .type('form')
      .send({ token: INVITE_TOKEN })
      .expect('Cache-Control', 'private, no-store, max-age=0')
      .expect('Pragma', 'no-cache')
      .expect('Referrer-Policy', 'no-referrer')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(415);

    expect(response.body).toEqual({
      message: 'Некорректный запрос приглашения',
      reasonCode: 'INVITE_REQUEST_MEDIA_TYPE_INVALID',
    });
    expect(authService.getInvite).not.toHaveBeenCalled();
  });

  it('rejects an oversized API body before service dispatch', async () => {
    const canary = 'OVERSIZED_INVITE_CANARY';
    const response = await request(app.getHttpServer())
      .post('/auth/invites/preview')
      .set('Content-Type', 'application/json')
      .send(
        JSON.stringify({
          token: INVITE_TOKEN,
          padding: `${canary}${'x'.repeat(5_000)}`,
        }),
      )
      .expect('Cache-Control', 'private, no-store, max-age=0')
      .expect('Pragma', 'no-cache')
      .expect('Referrer-Policy', 'no-referrer')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(413);

    expect(response.body).toEqual({
      message: 'Некорректный запрос приглашения',
      reasonCode: 'INVITE_REQUEST_TOO_LARGE',
    });
    expect(JSON.stringify(response.body)).not.toContain(canary);
    expect(authService.getInvite).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON without reflecting parser input', async () => {
    const canary = 'MALFORMED_INVITE_CANARY';
    const response = await request(app.getHttpServer())
      .post('/auth/invites/preview')
      .set('Content-Type', 'application/json')
      .send(`{"token":"${canary}`)
      .expect('Cache-Control', 'private, no-store, max-age=0')
      .expect('Pragma', 'no-cache')
      .expect('Referrer-Policy', 'no-referrer')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(400);

    expect(response.body).toEqual({
      message: 'Некорректный запрос приглашения',
      reasonCode: 'INVITE_REQUEST_BODY_INVALID',
    });
    expect(JSON.stringify(response.body)).not.toContain(canary);
    expect(authService.getInvite).not.toHaveBeenCalled();
  });
});

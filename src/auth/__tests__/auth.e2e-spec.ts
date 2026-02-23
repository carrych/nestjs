/**
 * Auth E2E Tests (login + logout)
 *
 * Run:
 *   yarn test:e2e --testPathPattern=auth.e2e-spec
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { getAuthToken, bearerHeader } from '../../common/test-helpers/auth.helper';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  const EMAIL = `auth-e2e-${Date.now()}@example.com`;
  const PASSWORD = 'Password123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    // Register user
    await request(app.getHttpServer()).post('/users').send({ email: EMAIL, password: PASSWORD });
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /auth/login ─────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('200 with valid credentials → returns accessToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(typeof res.body.accessToken).toBe('string');
    });

    it('401 with wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: EMAIL, password: 'wrong' })
        .expect(401);
    });

    it('401 with unknown email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD })
        .expect(401);
    });

    it('400 with missing fields', async () => {
      await request(app.getHttpServer()).post('/auth/login').send({}).expect(400);
    });
  });

  // ─── POST /auth/logout ────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('204 with valid token', async () => {
      const token = await getAuthToken(app, EMAIL, PASSWORD);
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set(bearerHeader(token))
        .expect(204);
    });

    it('401 without token', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });

    it('token is rejected after logout', async () => {
      const token = await getAuthToken(app, EMAIL, PASSWORD);

      // Use the token once — should work
      await request(app.getHttpServer())
        .get('/users')
        .set(bearerHeader(token))
        .expect(200);

      // Logout
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set(bearerHeader(token))
        .expect(204);

      // Same token is now rejected
      await request(app.getHttpServer())
        .get('/users')
        .set(bearerHeader(token))
        .expect(401);
    });

    it('can log in again after logout', async () => {
      const token = await getAuthToken(app, EMAIL, PASSWORD);
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set(bearerHeader(token))
        .expect(204);

      // Fresh login should succeed
      const newToken = await getAuthToken(app, EMAIL, PASSWORD);
      expect(newToken).toBeDefined();
      expect(typeof newToken).toBe('string');

      // New token works
      await request(app.getHttpServer())
        .get('/users')
        .set(bearerHeader(newToken))
        .expect(200);
    });
  });
});

/**
 * Auth E2E Tests (login, logout, role assignment, session revocation)
 *
 * Run:
 *   yarn test:e2e --testPathPattern=auth.e2e-spec
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { getAuthToken, bearerHeader } from '../../common/test-helpers/auth.helper';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const EMAIL    = `auth-e2e-${Date.now()}@example.com`;
  const PASSWORD = 'Password123!';

  const ADMIN_EMAIL = `auth-admin-${Date.now()}@example.com`;

  let userId: number;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    // Register regular user
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({ email: EMAIL, password: PASSWORD });
    userId = res.body.id as number;

    // Register + promote admin
    await getAuthToken(app, ADMIN_EMAIL, PASSWORD);
    await dataSource.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [ADMIN_EMAIL]);
    adminToken = await getAuthToken(app, ADMIN_EMAIL, PASSWORD);
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

    it('token is rejected after logout (JTI in blacklist)', async () => {
      const token = await getAuthToken(app, EMAIL, PASSWORD);

      await request(app.getHttpServer()).get('/users').set(bearerHeader(token)).expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set(bearerHeader(token))
        .expect(204);

      await request(app.getHttpServer()).get('/users').set(bearerHeader(token)).expect(401);
    });

    it('can log in again with a fresh token after logout', async () => {
      const token = await getAuthToken(app, EMAIL, PASSWORD);
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set(bearerHeader(token))
        .expect(204);

      const newToken = await getAuthToken(app, EMAIL, PASSWORD);
      expect(typeof newToken).toBe('string');
      await request(app.getHttpServer()).get('/users').set(bearerHeader(newToken)).expect(200);
    });
  });

  // ─── PATCH /users/:id/role ────────────────────────────────────────────────

  describe('PATCH /users/:id/role', () => {
    it('403 for regular user', async () => {
      const token = await getAuthToken(app, EMAIL, PASSWORD);
      await request(app.getHttpServer())
        .patch(`/users/${userId}/role`)
        .set(bearerHeader(token))
        .send({ role: 'admin' })
        .expect(403);
    });

    it('401 without token', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${userId}/role`)
        .send({ role: 'admin' })
        .expect(401);
    });

    it('200 — admin assigns role, response reflects new role', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${userId}/role`)
        .set(bearerHeader(adminToken))
        .send({ role: 'admin' })
        .expect(200);

      expect(res.body.role).toBe('admin');

      // Restore to user
      await request(app.getHttpServer())
        .patch(`/users/${userId}/role`)
        .set(bearerHeader(adminToken))
        .send({ role: 'user' })
        .expect(200);
    });

    it('400 with invalid role value', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${userId}/role`)
        .set(bearerHeader(adminToken))
        .send({ role: 'superuser' })
        .expect(400);
    });

    it('404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .patch('/users/999999/role')
        .set(bearerHeader(adminToken))
        .send({ role: 'admin' })
        .expect(404);
    });
  });

  // ─── POST /users/:id/revoke-sessions ──────────────────────────────────────

  describe('POST /users/:id/revoke-sessions', () => {
    it('401 without token', async () => {
      await request(app.getHttpServer())
        .post(`/users/${userId}/revoke-sessions`)
        .expect(401);
    });

    it('403 for regular user', async () => {
      const token = await getAuthToken(app, EMAIL, PASSWORD);
      await request(app.getHttpServer())
        .post(`/users/${userId}/revoke-sessions`)
        .set(bearerHeader(token))
        .expect(403);
    });

    it('204 — admin revokes sessions, existing token becomes invalid', async () => {
      // User gets a valid token
      const userToken = await getAuthToken(app, EMAIL, PASSWORD);
      await request(app.getHttpServer()).get('/users').set(bearerHeader(userToken)).expect(200);

      // Admin revokes all sessions for that user
      await request(app.getHttpServer())
        .post(`/users/${userId}/revoke-sessions`)
        .set(bearerHeader(adminToken))
        .expect(204);

      // Old token now rejected (tokenVersion mismatch)
      await request(app.getHttpServer()).get('/users').set(bearerHeader(userToken)).expect(401);
    });

    it('user can log in again after revocation', async () => {
      await request(app.getHttpServer())
        .post(`/users/${userId}/revoke-sessions`)
        .set(bearerHeader(adminToken))
        .expect(204);

      const newToken = await getAuthToken(app, EMAIL, PASSWORD);
      await request(app.getHttpServer()).get('/users').set(bearerHeader(newToken)).expect(200);
    });

    it('404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/users/999999/revoke-sessions')
        .set(bearerHeader(adminToken))
        .expect(404);
    });
  });
});

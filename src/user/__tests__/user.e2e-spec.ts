/**
 * Users E2E Tests
 *
 * Covers CRUD endpoints on /users that are not already tested in auth.e2e-spec.ts.
 * Auth-only endpoints (role assignment, session revocation) live in auth.e2e-spec.ts.
 *
 * Run:
 *   yarn test:e2e --testPathPattern=user.e2e-spec
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { getAuthToken, bearerHeader } from '../../common/test-helpers/auth.helper';

// ─── helpers ─────────────────────────────────────────────────────────────────

let _counter = 0;
function uniqueEmail(prefix = 'user-e2e'): string {
  return `${prefix}-${Date.now()}-${++_counter}@example.com`;
}

const PASSWORD = 'Password123!';

async function createUser(
  app: INestApplication,
  email = uniqueEmail(),
): Promise<{ id: number; email: string; token: string }> {
  const res = await request(app.getHttpServer())
    .post('/users')
    .send({ email, password: PASSWORD })
    .expect(201);

  const token = await getAuthToken(app, email, PASSWORD);
  return { id: Number((res.body as { id: string }).id), email, token };
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe('UsersController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /users
  // ──────────────────────────────────────────────────────────────────────────

  describe('POST /users', () => {
    it('201 — creates user and returns public fields (no passwordHash)', async () => {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ email, password: PASSWORD })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.anything(),
        email,
        role: 'user',
      });
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('400 for invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'not-an-email', password: PASSWORD })
        .expect(400);
    });

    it('400 for password shorter than 6 characters', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ email: uniqueEmail(), password: '12345' })
        .expect(400);
    });

    it('400 when email is missing', async () => {
      await request(app.getHttpServer()).post('/users').send({ password: PASSWORD }).expect(400);
    });

    it('400 when password is missing', async () => {
      await request(app.getHttpServer()).post('/users').send({ email: uniqueEmail() }).expect(400);
    });

    it('400 for unknown fields (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ email: uniqueEmail(), password: PASSWORD, role: 'admin' })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /users/:id
  // ──────────────────────────────────────────────────────────────────────────

  describe('GET /users/:id', () => {
    it('200 — returns user by id (no passwordHash)', async () => {
      const { id, email } = await createUser(app);

      const res = await request(app.getHttpServer()).get(`/users/${id}`).expect(200);

      expect(res.body).toMatchObject({ id: expect.anything(), email, role: 'user' });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('404 for non-existent user', async () => {
      const res = await request(app.getHttpServer()).get('/users/999999').expect(404);
      expect(res.body).toHaveProperty('message');
    });

    it('400 for non-integer id', async () => {
      await request(app.getHttpServer()).get('/users/abc').expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /users
  // ──────────────────────────────────────────────────────────────────────────

  describe('GET /users', () => {
    it('401 without auth token', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('200 — returns array of users', async () => {
      const { token } = await createUser(app);

      const res = await request(app.getHttpServer())
        .get('/users')
        .set(bearerHeader(token))
        .expect(200);

      const users = res.body as unknown[];
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
      expect(users[0]).toHaveProperty('id');
      expect(users[0]).toHaveProperty('email');
      expect(users[0]).not.toHaveProperty('passwordHash');
    });

    it('pagination: limit=1 returns exactly 1 user', async () => {
      const { token } = await createUser(app);

      const res = await request(app.getHttpServer())
        .get('/users')
        .query({ limit: 1 })
        .set(bearerHeader(token))
        .expect(200);

      expect(res.body).toHaveLength(1);
    });

    it('pagination: limit is capped at 100', async () => {
      const { token } = await createUser(app);

      const res = await request(app.getHttpServer())
        .get('/users')
        .query({ limit: 999 })
        .set(bearerHeader(token))
        .expect(200);

      expect((res.body as unknown[]).length).toBeLessThanOrEqual(100);
    });

    it('pagination: page=2 with limit=1 returns different user than page=1', async () => {
      const { token } = await createUser(app);

      const page1 = await request(app.getHttpServer())
        .get('/users')
        .query({ page: 1, limit: 1 })
        .set(bearerHeader(token))
        .expect(200);

      const page2 = await request(app.getHttpServer())
        .get('/users')
        .query({ page: 2, limit: 1 })
        .set(bearerHeader(token))
        .expect(200);

      const p1 = page1.body as Array<{ id: string }>;
      const p2 = page2.body as Array<{ id: string }>;
      expect(Number(p1[0].id)).not.toBe(Number(p2[0].id));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /users/:id
  // ──────────────────────────────────────────────────────────────────────────

  describe('PATCH /users/:id', () => {
    it('200 — updates email', async () => {
      const { id } = await createUser(app);
      const newEmail = uniqueEmail('updated');

      const res = await request(app.getHttpServer())
        .patch(`/users/${id}`)
        .send({ email: newEmail })
        .expect(200);

      expect((res.body as { email: string }).email).toBe(newEmail);
    });

    it('400 for invalid email format', async () => {
      const { id } = await createUser(app);

      await request(app.getHttpServer())
        .patch(`/users/${id}`)
        .send({ email: 'not-valid' })
        .expect(400);
    });

    it('404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .patch('/users/999999')
        .send({ email: uniqueEmail() })
        .expect(404);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /users/:id/password
  // ──────────────────────────────────────────────────────────────────────────

  describe('PATCH /users/:id/password', () => {
    it('204 — updates password successfully', async () => {
      const { id } = await createUser(app);

      await request(app.getHttpServer())
        .patch(`/users/${id}/password`)
        .send({ password: 'NewPassword123!' })
        .expect(204);
    });

    it('can log in with the new password after update', async () => {
      const email = uniqueEmail('pwchange');
      const { id } = await createUser(app, email);

      await request(app.getHttpServer())
        .patch(`/users/${id}/password`)
        .send({ password: 'NewPassword123!' })
        .expect(204);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'NewPassword123!' })
        .expect(200);

      expect(loginRes.body).toHaveProperty('accessToken');
    });

    it('400 for password shorter than 6 characters', async () => {
      const { id } = await createUser(app);

      await request(app.getHttpServer())
        .patch(`/users/${id}/password`)
        .send({ password: '123' })
        .expect(400);
    });

    it('404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .patch('/users/999999/password')
        .send({ password: PASSWORD })
        .expect(404);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /users/:id
  // ──────────────────────────────────────────────────────────────────────────

  describe('DELETE /users/:id', () => {
    it('204 — deletes user, subsequent GET returns 404', async () => {
      const { id } = await createUser(app);

      await request(app.getHttpServer()).delete(`/users/${id}`).expect(204);
      await request(app.getHttpServer()).get(`/users/${id}`).expect(404);
    });

    it('404 for non-existent user', async () => {
      await request(app.getHttpServer()).delete('/users/999999').expect(404);
    });
  });
});

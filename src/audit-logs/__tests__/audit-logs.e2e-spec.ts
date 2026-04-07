/**
 * Audit Logs E2E Tests
 *
 * Prerequisites:
 *   - DB running with all migrations applied (including 1700000005000-create-audit-logs)
 *   - yarn db:reset (seed data)
 *
 * Run:
 *   yarn test:e2e --testPathPattern=audit-logs.e2e-spec
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { getAuthToken, bearerHeader } from '../../common/test-helpers/auth.helper';

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a product with a unique name/slug so tests don't collide.
 * Returns the created product id.
 */
async function createUniqueProduct(app: INestApplication): Promise<number> {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await request(app.getHttpServer())
    .post('/products')
    .send({ name: `Audit Product ${uid}`, slug: `audit-${uid}`, price: 999 })
    .expect(201);
  return res.body.id as number;
}

/**
 * Polls GET /audit-logs until a log with the given action + entityId appears.
 *
 * Use for PATCH / DELETE where the route has :id → entityId is stored in the log.
 * Passes limit=100 to avoid the default-20 pagination cutting off results.
 */
async function waitForAuditLogByEntityId(
  app: INestApplication,
  adminToken: string,
  filters: { action: string; entityId: string },
  maxWaitMs = 500,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ action: filters.action, limit: 100 })
      .set(bearerHeader(adminToken));
    const logs = res.body.data as Array<{ action: string; entityId: string | null }>;
    if (logs.some((l) => l.entityId === filters.entityId)) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

/**
 * Polls GET /audit-logs until the total count for the given action reaches minTotal.
 *
 * Use for POST (CREATE) where the route is a collection endpoint (no :id param) →
 * the interceptor stores entityId = null, so we cannot match by entityId.
 * Instead, take a count snapshot before the action, then poll until count increases.
 */
async function waitForAuditLogCountReached(
  app: INestApplication,
  adminToken: string,
  action: string,
  minTotal: number,
  maxWaitMs = 500,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ action, limit: 1 }) // only need `total`, not data
      .set(bearerHeader(adminToken));
    if ((res.body.total as number) >= minTotal) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe('AuditLogsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let userToken: string;

  const ADMIN_EMAIL = `audit-admin-${Date.now()}@example.com`;
  const USER_EMAIL = `audit-user-${Date.now()}@example.com`;
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

    dataSource = moduleFixture.get(DataSource);

    userToken = await getAuthToken(app, USER_EMAIL, PASSWORD);

    await getAuthToken(app, ADMIN_EMAIL, PASSWORD);
    await dataSource.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [ADMIN_EMAIL]);
    adminToken = await getAuthToken(app, ADMIN_EMAIL, PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Auth checks ──────────────────────────────────────────────────────────

  describe('GET /audit-logs — auth', () => {
    it('401 without token', async () => {
      await request(app.getHttpServer()).get('/audit-logs').expect(401);
    });

    it('403 with regular user token', async () => {
      await request(app.getHttpServer())
        .get('/audit-logs')
        .set(bearerHeader(userToken))
        .expect(403);
    });

    it('200 with admin token — returns { data, total }', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .set(bearerHeader(adminToken))
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ─── Audit log creation ───────────────────────────────────────────────────
  //
  // Each test is fully independent:
  //   - creates its own unique product via createUniqueProduct()
  //   - uses the appropriate polling helper to wait for the log without setTimeout
  //
  // Why two helpers instead of one?
  //   POST /products has no :id route param → AuditLogInterceptor stores entityId = null.
  //   PATCH/DELETE /products/:id have :id → entityId = String(productId).
  //   We cannot use entityId to identify a CREATE log, so we compare total counts instead.

  describe('audit log creation via product mutations', () => {
    it('logs CREATE_PRODUCT after POST /products', async () => {
      // Snapshot count before — POST stores entityId=null so we can't match by id
      const beforeRes = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ action: 'CREATE_PRODUCT', limit: 1 })
        .set(bearerHeader(adminToken));
      const countBefore = beforeRes.body.total as number;

      await createUniqueProduct(app);

      const found = await waitForAuditLogCountReached(
        app,
        adminToken,
        'CREATE_PRODUCT',
        countBefore + 1,
      );
      expect(found).toBe(true);
    });

    it('logs UPDATE_PRODUCT after PATCH /products/:id', async () => {
      const id = await createUniqueProduct(app);

      await request(app.getHttpServer())
        .patch(`/products/${id}`)
        .send({ name: `Updated ${Date.now()}` })
        .expect(200);

      // PATCH /products/:id → entityId = String(id) in the log
      const found = await waitForAuditLogByEntityId(app, adminToken, {
        action: 'UPDATE_PRODUCT',
        entityId: String(id),
      });
      expect(found).toBe(true);
    });

    it('logs DELETE_PRODUCT after DELETE /products/:id', async () => {
      const id = await createUniqueProduct(app);

      await request(app.getHttpServer()).delete(`/products/${id}`).expect(204);

      // DELETE /products/:id → entityId = String(id) in the log
      const found = await waitForAuditLogByEntityId(app, adminToken, {
        action: 'DELETE_PRODUCT',
        entityId: String(id),
      });
      expect(found).toBe(true);
    });
  });

  // ─── Pagination ───────────────────────────────────────────────────────────

  describe('GET /audit-logs — pagination', () => {
    it('respects limit', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ limit: 2, offset: 0 })
        .set(bearerHeader(adminToken))
        .expect(200);

      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(typeof res.body.total).toBe('number');
    });

    it('respects offset', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ limit: 1, offset: 0 })
        .set(bearerHeader(adminToken))
        .expect(200);

      const page2 = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ limit: 1, offset: 1 })
        .set(bearerHeader(adminToken))
        .expect(200);

      if (page1.body.total > 1) {
        expect(page1.body.data[0].id).not.toBe(page2.body.data[0]?.id);
      }
    });
  });

  // ─── Filters ──────────────────────────────────────────────────────────────

  describe('GET /audit-logs — filters', () => {
    it('filters by entityType', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ entityType: 'product' })
        .set(bearerHeader(adminToken))
        .expect(200);

      const logs = res.body.data as Array<{ entityType: string }>;
      logs.forEach((l) => expect(l.entityType).toBe('product'));
    });

    it('filters by action', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ action: 'CREATE_PRODUCT' })
        .set(bearerHeader(adminToken))
        .expect(200);

      const logs = res.body.data as Array<{ action: string }>;
      logs.forEach((l) => expect(l.action).toBe('CREATE_PRODUCT'));
    });

    it('POST /auth/login is NOT logged (@SkipAuditLog)', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ entityType: 'auth' })
        .set(bearerHeader(adminToken))
        .expect(200);

      expect(res.body.total).toBe(0);
    });
  });
});

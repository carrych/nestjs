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

describe('AuditLogsController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let userToken: string;

  const ADMIN_EMAIL = `audit-admin-${Date.now()}@example.com`;
  const USER_EMAIL = `audit-user-${Date.now()}@example.com`;
  const PASSWORD = 'Password123!';

  const PRODUCT_PAYLOAD = {
    name: `Audit Test Product ${Date.now()}`,
    slug: `audit-test-${Date.now()}`,
    price: 999,
  };

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
    userToken = await getAuthToken(app, USER_EMAIL, PASSWORD);

    // Register + promote admin
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

  // ─── Log creation via mutations ───────────────────────────────────────────

  describe('POST /products → audit log CREATE_PRODUCT', () => {
    let productId: number;

    it('creates a product successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .send(PRODUCT_PAYLOAD)
        .expect(201);

      productId = res.body.id as number;
      expect(productId).toBeDefined();
    });

    it('audit log with action CREATE_PRODUCT exists after POST', async () => {
      // Give fire-and-forget a moment to persist
      await new Promise((r) => setTimeout(r, 50));

      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ action: 'CREATE_PRODUCT', entityType: 'product' })
        .set(bearerHeader(adminToken))
        .expect(200);

      const logs = res.body.data as Array<{ action: string; entityType: string }>;
      const found = logs.find((l) => l.action === 'CREATE_PRODUCT' && l.entityType === 'product');
      expect(found).toBeDefined();
    });

    it('audit log with action UPDATE_PRODUCT exists after PATCH', async () => {
      await request(app.getHttpServer())
        .patch(`/products/${productId}`)
        .send({ name: 'Updated Audit Product' })
        .expect(200);

      await new Promise((r) => setTimeout(r, 50));

      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ action: 'UPDATE_PRODUCT', entityType: 'product' })
        .set(bearerHeader(adminToken))
        .expect(200);

      const logs = res.body.data as Array<{
        action: string;
        entityType: string;
        entityId: string;
      }>;
      const found = logs.find(
        (l) => l.action === 'UPDATE_PRODUCT' && l.entityId === String(productId),
      );
      expect(found).toBeDefined();
    });

    it('audit log with action DELETE_PRODUCT exists after DELETE', async () => {
      await request(app.getHttpServer()).delete(`/products/${productId}`).expect(204);

      await new Promise((r) => setTimeout(r, 50));

      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ action: 'DELETE_PRODUCT', entityType: 'product' })
        .set(bearerHeader(adminToken))
        .expect(200);

      const logs = res.body.data as Array<{
        action: string;
        entityType: string;
        entityId: string;
      }>;
      const found = logs.find(
        (l) => l.action === 'DELETE_PRODUCT' && l.entityId === String(productId),
      );
      expect(found).toBeDefined();
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

      // Different records on different pages (if total > 1)
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
      // Login is @SkipAuditLog — should not appear in audit_logs
      const before = await request(app.getHttpServer())
        .get('/audit-logs')
        .query({ entityType: 'auth' })
        .set(bearerHeader(adminToken))
        .expect(200);

      expect(before.body.total).toBe(0);
    });
  });
});

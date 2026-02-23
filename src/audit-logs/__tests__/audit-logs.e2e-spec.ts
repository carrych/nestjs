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
});

/**
 * Security E2E Tests — request tracing (X-Request-ID)
 *
 * Verifies that RequestIdMiddleware is wired up in AppModule.configure().
 * A unit test covers the middleware logic itself; this test covers the wiring.
 *
 * NOTE: Helmet headers (X-Frame-Options, CSP, etc.) are applied in main.ts,
 * which is NOT executed in E2E test setup. Those headers are verified by the
 * security-evidence/headers.txt curl capture, not by automated tests.
 *
 * Run:
 *   yarn test:e2e  (picks up automatically via .e2e-spec.ts pattern)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';

describe('Security (e2e)', () => {
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

  // ─── X-Request-ID middleware ──────────────────────────────────────────────

  describe('X-Request-ID middleware', () => {
    it('generates a UUID when no X-Request-ID header is sent', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      const id = res.headers['x-request-id'];

      expect(id).toBeDefined();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('echoes back the client-supplied X-Request-ID unchanged', async () => {
      const clientId = 'my-trace-id-e2e-test';
      const res = await request(app.getHttpServer()).get('/health').set('x-request-id', clientId);

      expect(res.headers['x-request-id']).toBe(clientId);
    });
  });
});

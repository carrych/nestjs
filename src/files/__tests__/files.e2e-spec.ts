/**
 * Files E2E Tests (with LocalStack S3)
 *
 * Prerequisites:
 *   - LocalStack running on http://localhost:4566 with S3 service
 *   - Bucket 'test-bucket' created (see docker-compose.yml + scripts/localstack-init.sh)
 *   - .env.test with LocalStack config
 *
 * Start LocalStack:
 *   docker compose up localstack -d
 *
 * Run:
 *   yarn test:e2e --testPathPattern=files.e2e-spec
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { getAuthToken, bearerHeader } from '../../common/test-helpers/auth.helper';

// ─── helpers ─────────────────────────────────────────────────────────────────

const PRESIGN_PAYLOAD = {
  entityType: 'product-image',
  entityId: '1',
  contentType: 'image/png',
  size: 100,
};

/**
 * Presign only — returns fileId + uploadUrl without completing the upload.
 * Use this when the test needs a pending (not yet completed) file record.
 */
async function createPendingFile(
  app: INestApplication,
  token: string,
): Promise<{ fileId: string; uploadUrl: string }> {
  const res = await request(app.getHttpServer())
    .post('/files/presign')
    .set(bearerHeader(token))
    .send(PRESIGN_PAYLOAD)
    .expect(201);
  return { fileId: res.body.fileId as string, uploadUrl: res.body.uploadUrl as string };
}

/**
 * Full presign → upload to S3 → complete cycle.
 * Use this when the test needs a ready (completed) file record.
 */
async function createAndCompleteFile(app: INestApplication, token: string): Promise<string> {
  const { fileId, uploadUrl } = await createPendingFile(app, token);

  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png', 'Content-Length': '100' },
    body: Buffer.alloc(100, 0xff),
  });

  await request(app.getHttpServer())
    .post('/files/complete')
    .set(bearerHeader(token))
    .send({ fileId })
    .expect(200);

  return fileId;
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe('FilesController (e2e)', () => {
  let app: INestApplication;
  let userToken: string;
  let otherUserToken: string;

  const USER_EMAIL = `files-test-${Date.now()}@example.com`;
  const OTHER_EMAIL = `files-other-${Date.now()}@example.com`;
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

    userToken = await getAuthToken(app, USER_EMAIL, PASSWORD);
    otherUserToken = await getAuthToken(app, OTHER_EMAIL, PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /files/presign
  // ──────────────────────────────────────────────────────────────────────────

  describe('POST /files/presign', () => {
    it('401 without auth token', async () => {
      await request(app.getHttpServer()).post('/files/presign').send(PRESIGN_PAYLOAD).expect(401);
    });

    it('400 for disallowed contentType', async () => {
      await request(app.getHttpServer())
        .post('/files/presign')
        .set(bearerHeader(userToken))
        .send({ ...PRESIGN_PAYLOAD, contentType: 'application/pdf' })
        .expect(400);
    });

    it('400 for size exceeding limit', async () => {
      await request(app.getHttpServer())
        .post('/files/presign')
        .set(bearerHeader(userToken))
        .send({ ...PRESIGN_PAYLOAD, size: 20 * 1024 * 1024 })
        .expect(400);
    });

    it('201 with valid payload — returns fileId and uploadUrl', async () => {
      const res = await request(app.getHttpServer())
        .post('/files/presign')
        .set(bearerHeader(userToken))
        .send(PRESIGN_PAYLOAD)
        .expect(201);

      expect(res.body).toMatchObject({
        fileId: expect.any(String),
        key: expect.stringContaining('products/1/images/'),
        uploadUrl: expect.any(String),
        uploadMethod: 'PUT',
        contentType: 'image/png',
        expiresInSec: expect.any(Number),
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Full upload flow
  //
  // Happy path runs as a single test — all steps share local variables and
  // there is no ordering dependency between it() blocks.
  // Edge cases each create their own file via helpers and are fully independent.
  // ──────────────────────────────────────────────────────────────────────────

  describe('Full upload flow', () => {
    it('presign → upload to S3 → complete — happy path', async () => {
      // Step 1: presign
      const presignRes = await request(app.getHttpServer())
        .post('/files/presign')
        .set(bearerHeader(userToken))
        .send(PRESIGN_PAYLOAD)
        .expect(201);

      const { fileId, uploadUrl } = presignRes.body as { fileId: string; uploadUrl: string };
      expect(fileId).toBeDefined();
      expect(uploadUrl).toMatch(/^http/);

      // Step 2: upload to LocalStack S3
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': '100' },
        body: Buffer.alloc(100, 0xff),
      });
      expect(putRes.status).toBeLessThan(300);

      // Step 3: complete → status becomes ready
      const completeRes = await request(app.getHttpServer())
        .post('/files/complete')
        .set(bearerHeader(userToken))
        .send({ fileId })
        .expect(200);

      expect(completeRes.body.status).toBe('ready');
      expect(completeRes.body.viewUrl).toBeDefined();
    });

    it('complete fails with 400 when file is already completed', async () => {
      // Own completed file — independent of the happy-path test above
      const fileId = await createAndCompleteFile(app, userToken);

      await request(app.getHttpServer())
        .post('/files/complete')
        .set(bearerHeader(userToken))
        .send({ fileId })
        .expect(400);
    });

    it('other user cannot complete another user file → 403', async () => {
      // Own pending file belonging to userToken
      const { fileId } = await createPendingFile(app, userToken);

      await request(app.getHttpServer())
        .post('/files/complete')
        .set(bearerHeader(otherUserToken))
        .send({ fileId })
        .expect(403);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /files/:id
  // ──────────────────────────────────────────────────────────────────────────

  describe('DELETE /files/:id', () => {
    it('401 without token', async () => {
      await request(app.getHttpServer()).delete('/files/some-uuid').expect(401);
    });

    it('403 when another user tries to delete', async () => {
      const { fileId } = await createPendingFile(app, userToken);

      await request(app.getHttpServer())
        .delete(`/files/${fileId}`)
        .set(bearerHeader(otherUserToken))
        .expect(403);
    });
  });
});

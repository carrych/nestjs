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

    // Get tokens for two separate users
    userToken = await getAuthToken(app, USER_EMAIL, PASSWORD);
    otherUserToken = await getAuthToken(app, OTHER_EMAIL, PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /files/presign — auth checks
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /files/presign', () => {
    const validBody = {
      entityType: 'product-image',
      entityId: '1',
      contentType: 'image/png',
      size: 1024,
    };

    it('401 without auth token', async () => {
      await request(app.getHttpServer()).post('/files/presign').send(validBody).expect(401);
    });

    it('400 for disallowed contentType', async () => {
      await request(app.getHttpServer())
        .post('/files/presign')
        .set(bearerHeader(userToken))
        .send({ ...validBody, contentType: 'application/pdf' })
        .expect(400);
    });

    it('400 for size exceeding limit', async () => {
      await request(app.getHttpServer())
        .post('/files/presign')
        .set(bearerHeader(userToken))
        .send({ ...validBody, size: 20 * 1024 * 1024 })
        .expect(400);
    });

    it('201 with valid payload — returns fileId and uploadUrl', async () => {
      const res = await request(app.getHttpServer())
        .post('/files/presign')
        .set(bearerHeader(userToken))
        .send(validBody)
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
  // Full flow: presign → PUT to S3 → complete → verify
  // ──────────────────────────────────────────────────────────────────────────
  describe('Full upload flow', () => {
    let fileId: string;
    let uploadUrl: string;

    it('presign creates pending record', async () => {
      const res = await request(app.getHttpServer())
        .post('/files/presign')
        .set(bearerHeader(userToken))
        .send({
          entityType: 'product-image',
          entityId: '1',
          contentType: 'image/png',
          size: 100,
        })
        .expect(201);

      fileId = res.body.fileId as string;
      uploadUrl = res.body.uploadUrl as string;

      expect(fileId).toBeDefined();
      expect(uploadUrl).toMatch(/^http/);
    });

    it('PUT file to S3 via presigned URL', async () => {
      // Upload a small fake PNG to LocalStack
      const fakeImage = Buffer.alloc(100, 0xff);
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': '100' },
        body: fakeImage,
      });
      expect(putRes.status).toBeLessThan(300);
    });

    it('POST /files/complete → 200, status ready', async () => {
      const res = await request(app.getHttpServer())
        .post('/files/complete')
        .set(bearerHeader(userToken))
        .send({ fileId })
        .expect(200);

      expect(res.body.status).toBe('ready');
      expect(res.body.viewUrl).toBeDefined();
    });

    it('POST /files/complete again → 400 already completed', async () => {
      await request(app.getHttpServer())
        .post('/files/complete')
        .set(bearerHeader(userToken))
        .send({ fileId })
        .expect(400);
    });

    it('other user cannot complete own user file → 403', async () => {
      // Create a new pending file for userToken, then try to complete as otherUser
      const presignRes = await request(app.getHttpServer())
        .post('/files/presign')
        .set(bearerHeader(userToken))
        .send({ entityType: 'product-image', entityId: '1', contentType: 'image/jpeg', size: 50 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/files/complete')
        .set(bearerHeader(otherUserToken))
        .send({ fileId: presignRes.body.fileId })
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
      // Create file as userToken
      const presignRes = await request(app.getHttpServer())
        .post('/files/presign')
        .set(bearerHeader(userToken))
        .send({ entityType: 'product-image', entityId: '1', contentType: 'image/png', size: 50 })
        .expect(201);

      // Other user tries to delete it
      await request(app.getHttpServer())
        .delete(`/files/${presignRes.body.fileId as string}`)
        .set(bearerHeader(otherUserToken))
        .expect(403);
    });
  });
});

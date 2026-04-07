import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Login helper for E2E tests.
 * Registers a user if not exists, then logs in and returns a JWT Bearer token.
 *
 * Usage:
 *   const token = await getAuthToken(app, 'test@example.com', 'password123');
 *   request(app.getHttpServer()).get('/files').set('Authorization', `Bearer ${token}`)
 */
export async function getAuthToken(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  // Try login first
  const loginRes = await request(app.getHttpServer()).post('/auth/login').send({ email, password });

  if (loginRes.status === 200) {
    return loginRes.body.accessToken as string;
  }

  // Register if not exists
  await request(app.getHttpServer()).post('/users').send({ email, password });

  const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password });

  if (!res.body.accessToken) {
    throw new Error(`Failed to get auth token for ${email}: ${JSON.stringify(res.body)}`);
  }

  return res.body.accessToken as string;
}

export function bearerHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

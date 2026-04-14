import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import AppDataSource from '../data-source';

async function bootstrap() {
  await AppDataSource.initialize();
  const pending = await AppDataSource.showMigrations();
  if (pending) {
    Logger.log('Running pending migrations...', 'Migrations');
    await AppDataSource.runMigrations();
    Logger.log('Migrations complete', 'Migrations');
  }
  await AppDataSource.destroy();

  // Parse CORS origins from env: comma-separated list or '*' (dev only)
  const rawOrigins = process.env.CORS_ORIGINS ?? 'http://localhost:3000';
  const corsOrigins =
    rawOrigins === '*'
      ? '*'
      : rawOrigins
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);

  const app = await NestFactory.create(AppModule);

  // ── Security headers (Helmet) ──────────────────────────────────────
  // GraphQL playground and Swagger UI need 'unsafe-inline' for scripts/styles.
  // In production you should disable playground and tighten CSP.
  const isDev = process.env.NODE_ENV !== 'production';
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: isDev ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] : ["'self'"],
          styleSrc: isDev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: isDev ? null : [],
        },
      },
      // Allow GraphQL playground iframe embedding in dev
      crossOriginEmbedderPolicy: isDev ? false : true,
      // Prevent clickjacking
      frameguard: { action: 'deny' },
      // Hide server fingerprint
      hidePoweredBy: true,
      // Prevent MIME type sniffing
      noSniff: true,
      // Force HTTPS in production (1 year)
      hsts: isDev ? false : { maxAge: 31536000, includeSubDomains: true, preload: true },
      // XSS protection header (legacy browsers)
      xssFilter: true,
    }),
  );

  // ── CORS ──────────────────────────────────────────────────────────
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    credentials: true,
  });

  // ── Trust proxy for correct IP detection (when behind nginx/load balancer) ──
  // This ensures rate limiting and IP logging use the real client IP,
  // not the proxy's IP from X-Forwarded-For header.
  (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set(
    'trust proxy',
    1,
  );

  // ── Global validation ──────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);

  Logger.log(`🚀App listening on port ${await app.getUrl()}🚀`);
}

void bootstrap();

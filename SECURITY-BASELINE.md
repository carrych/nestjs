# Security Baseline

This document describes the security controls in place for the NestJS E-Commerce API.

## 1. HTTP Security Headers — `helmet`

Applied globally in `main.ts` via `app.use(helmet({...}))`.

| Header | Value | What it does |
|--------|-------|--------------|
| `Content-Security-Policy` | `default-src 'self'; ...` | Tells browsers which sources are allowed to load scripts, styles, images |
| `Strict-Transport-Security` | `max-age=15552000` | Instructs browsers to always use HTTPS for 180 days |
| `X-Frame-Options` | `DENY` | Prevents the page from being embedded in an `<iframe>` (clickjacking protection) |
| `X-Content-Type-Options` | `nosniff` | Stops browsers from guessing the content type (MIME sniffing) |
| `Referrer-Policy` | `no-referrer` | URL is not sent in the `Referer` header when navigating away |
| `Cross-Origin-Resource-Policy` | `same-origin` | Resources are only shareable with same-origin documents |

## 2. CORS — Cross-Origin Resource Sharing

Configured in `main.ts` via `app.enableCors()`.

- Allowed origins are read from `CORS_ORIGINS` env var (comma-separated list)
- `credentials: true` — cookies/auth headers are allowed from those origins
- Default (dev): `http://localhost:3000,http://localhost:5173`
- **Never** `origin: '*'` — that would allow any website to call the API

## 3. Rate Limiting — `@nestjs/throttler`

Applied via `CustomThrottlerGuard` globally + per-endpoint overrides.

| Throttler | Limit | Window | Applied to |
|-----------|-------|--------|------------|
| `global` | 100 req | 60 s | All endpoints |
| `strict` | 5 req | 60 s | Login, role change, revoke sessions, payment operations |

Rate limits are tracked per **client IP**. Behind a reverse proxy the real IP is read
from `X-Forwarded-For` (enabled by `trust proxy 1` in `main.ts`).

Response headers per request:
```
X-RateLimit-Limit-global: 100
X-RateLimit-Remaining-global: 99
X-RateLimit-Reset-global: 60
X-RateLimit-Limit-strict: 5
X-RateLimit-Remaining-strict: 4
```

When a limit is exceeded: **HTTP 429 Too Many Requests**.

## 4. X-Request-ID Middleware

`RequestIdMiddleware` (registered in `AppModule`) assigns every request a UUID correlation ID.

- Reads `X-Request-ID` header from the client (if present) and reuses it
- Otherwise generates a new UUID
- Attaches the ID to `req.requestId` for use by services/guards
- Echoes the ID back in the response header `X-Request-ID`

This enables end-to-end request tracing across logs and audit events.

## 5. Audit Logging

`AuditLogInterceptor` (global) records every mutating request (POST/PUT/PATCH/DELETE).  
`AuditLogsService.logEvent()` records specific domain events from services.

### Captured fields
| Field | Example |
|-------|---------|
| `event_type` | `auth.login_failed`, `user.role_changed` |
| `outcome` | `SUCCESS` or `FAILURE` |
| `user_id` | ID of the authenticated actor |
| `ip` | Real client IP (proxy-aware) |
| `correlation_id` | X-Request-ID value |
| `user_agent` | Browser/client identifier |
| `details` | Sanitized request body (passwords/tokens stripped) |

### Specific domain events logged
| Event | Trigger |
|-------|---------|
| `auth.login_failed` | Wrong email or wrong password |
| `auth.token_blacklisted` | User logs out |
| `user.role_changed` | Admin changes a user's role |
| `user.sessions_revoked` | Admin revokes all sessions for a user |

### Sensitive field sanitization
The interceptor strips these keys from logged request bodies:
`password`, `secret`, `token`, `authorization`, `hash`, `credential`

## 6. Authentication — JWT

- Tokens are signed with `HS256` using `JWT_SECRET` from env
- Default expiry: `15m` (configurable via `JWT_EXPIRES_IN`)
- Each token carries a `jti` (unique ID) and `tokenVersion`
- **Logout**: the `jti` is added to a `token_blacklist` table — the token is rejected on next use
- **Revoke all sessions**: incrementing `tokenVersion` in the user record invalidates all existing tokens
- Passwords are hashed with `bcrypt` (cost factor 12) — the raw password never touches the DB

## 7. Authorization — RBAC

Two roles: `USER` and `ADMIN`.  
Protected endpoints use `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)`.

Admin-only routes:
- `PATCH /users/:id/role` — change a user's role
- `POST /users/:id/revoke-sessions` — revoke all active sessions

## 8. Secret Management

All secrets are injected via environment variables — never hardcoded.

- `.env` is in `.gitignore` — never committed
- `.env.example` documents required variables with placeholder values
- `ConfigService.getOrThrow()` is used for required secrets — app crashes at startup if missing

## 9. TLS

TLS is terminated at the reverse proxy (nginx / Caddy / AWS ALB), not inside Node.js.  
The app sets `HSTS` via Helmet and uses `trust proxy 1` to correctly read real client IPs.

## 10. Input Validation

Global `ValidationPipe` in `main.ts`:
```ts
{ whitelist: true, forbidNonWhitelisted: true, transform: true }
```
- `whitelist: true` — strips unknown fields from request body
- `forbidNonWhitelisted: true` — rejects requests with unknown fields (HTTP 400)
- DTOs use `class-validator` decorators for type and value constraints

/**
 * Applied before every E2E test suite via jest-e2e.json "setupFiles".
 *
 * Disables throttling for E2E tests. Without this, tests that call
 * POST /auth/login multiple times (getAuthToken per test) hit the strict
 * rate limit (5 req/60s) and get unexpected 429 responses.
 *
 * CustomThrottlerGuard checks SKIP_THROTTLE=true and returns true immediately,
 * bypassing all rate limit checks — including @Throttle() decorator overrides.
 *
 * Production rate limiting is unaffected (env var is never set in prod).
 */
process.env.SKIP_THROTTLE = 'true';

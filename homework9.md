# Homework 9 — Files Module & S3 Presigned Upload

## What was done

1. Migrated `User` from in-memory to PostgreSQL — TypeORM entity, bcrypt password hashing, `user_role` enum (`user / staff / admin`), DB migration.

2. Added JWT auth module — `POST /auth/login`, JWT guard, role-based guard, `@CurrentUser()` and `@Roles()` decorators.

3. Added `FilesModule` with S3 presigned upload flow — client requests a presigned URL, uploads directly to S3 (backend never handles the bytes), then calls complete to confirm.

4. `StorageService` is the single point of contact with the AWS SDK — wraps presign, head-object check, delete, and URL generation. Supports LocalStack for local development.

5. File cleanup cron — runs every hour, removes abandoned pending uploads (expired before client uploaded) from both S3 and the DB.

6. Products now return `imageUrl` — when a product has an attached image, `GET /products/:id` includes the resolved URL.

7. LocalStack via Docker Compose for local S3 emulation — no real AWS account needed during development.

8. Tests — unit tests with `aws-sdk-client-mock` (no network), E2E tests against LocalStack, shared `getAuthToken` helper for all E2E suites.

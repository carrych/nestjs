# NestJS E-Commerce API

NestJS v11 e-commerce backend with TypeORM, PostgreSQL, GraphQL, JWT auth, and S3 file storage.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 / TypeScript |
| Framework | NestJS v11 |
| Database | PostgreSQL 16 + TypeORM 0.3 |
| API | REST + GraphQL (Apollo) |
| Auth | JWT (passport-jwt) |
| Storage | AWS S3 / LocalStack |
| Container | Docker + Docker Compose |

---

## Quick Start

### 1. Prepare environment

```bash
cp .env.example .env
# Edit .env: set DB_PASSWORD and JWT_SECRET at minimum
```

### 2. Run prod-like stack (API + PostgreSQL)

```bash
docker compose up --build
```

API available at **http://localhost:8080**
GraphQL playground: **http://localhost:8080/graphql**

### 3. Run dev stack (hot reload)

```bash
docker compose -f compose.yml -f compose.dev.yml up --build
```

Code changes are picked up instantly (no rebuild needed).
PostgreSQL also exposed on **localhost:5432** in dev mode.

---

## Migrations and Seed

One-off containers — run manually, finish and exit:

```bash
# Production (uses compiled dist/)
docker compose run --rm migrate
docker compose run --rm seed

# Development (uses ts-node via yarn scripts)
docker compose -f compose.yml -f compose.dev.yml run --rm migrate
docker compose -f compose.yml -f compose.dev.yml run --rm seed
```

`migrate` and `seed` use `profiles: [tools]` — they do NOT start automatically
with `docker compose up`. Always run them explicitly before starting the API.

---

## Full Workflow (First Run)

```bash
# 1. Start postgres
docker compose up -d postgres

# 2. Run migrations
docker compose run --rm migrate

# 3. (Optional) Seed data
docker compose run --rm seed

# 4. Start API
docker compose up -d api

# 5. Verify
curl http://localhost:8080/graphql \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

---

## Docker Architecture

### Multi-stage Dockerfile targets

| Target | Base | Purpose |
|--------|------|---------|
| `deps` | node:22-alpine | Install all deps (shared layer cache) |
| `dev` | node:22-alpine | Hot reload; bind-mounted source code |
| `build` | node:22-alpine | TypeScript compilation to dist/ |
| `prod-deps` | node:22-alpine | Production-only dependencies |
| `prod` | node:22-alpine | Minimal runtime; non-root user `appuser` |
| `prod-distroless` | distroless/nodejs22-debian12:nonroot | No shell, no OS tools, UID 65532 |

### Key optimizations

1. **Layer order**: `COPY package.json yarn.lock` first, then install, then `COPY . .`
   Dependency layer is cached until lockfile changes — no reinstall on source edits.

2. **BuildKit cache mounts**: `--mount=type=cache,target=/root/.yarn`
   Yarn download cache is reused across builds without polluting image layers.

3. **prod-deps stage**: `yarn install --production` strips devDependencies
   (`@nestjs/cli`, `ts-node`, `jest`, TypeScript compiler, etc.) — saves ~100-150 MB.

4. **distroless**: no shell, no package manager, no OS utilities.
   Reduces attack surface; runs as UID 65532 (nonroot) by default.

---

## Network Layout

```
host:8080 ──▶ api ──▶ backend (internal) ──▶ postgres  (no host port)
               │
               └──▶ public ──▶ internet (Nova Poshta, UkrPoshta, S3)
```

- `backend` network is `internal: true` — PostgreSQL is unreachable from outside Docker
- `public` network allows API to reach external shipping/storage providers
- PostgreSQL has no `ports:` directive — completely isolated from the host

---

## Image Size Evidence

Build and compare:

```bash
docker image ls nestjs-ecommerce
```

Expected results:

```
REPOSITORY          TAG               SIZE
nestjs-ecommerce    prod-distroless   ~160 MB
nestjs-ecommerce    prod              ~200 MB
nestjs-ecommerce    dev               ~350 MB
```

Inspect layers of the smallest image:

```bash
docker history nestjs-ecommerce:prod-distroless
```

Why distroless is smallest and safest:
- No `/bin/sh`, `/bin/bash` — no shell injection surface
- No `apt`/`apk` — nothing to escalate privileges with
- Only Node.js runtime + minimal libc/SSL
- UID 65532 (nonroot) — never runs as root

---

## Non-Root Verification

**prod (alpine stage):**

```bash
docker run --rm nestjs-ecommerce:prod id
# uid=1001(appuser) gid=1001(appgroup) groups=1001(appgroup)
```

**prod-distroless:**

No shell available — cannot run `id`. Non-root is enforced at the image level:

```bash
# Inspect image config
docker inspect nestjs-ecommerce:prod-distroless --format '{{.Config.User}}'

# The base image gcr.io/distroless/nodejs22-debian12:nonroot
# sets USER to UID 65532 (nonroot group) unconditionally.
# Our Dockerfile does not override USER, so :nonroot guarantees it.
```

Confirm no shell exists:

```bash
docker run --rm --entrypoint sh nestjs-ecommerce:prod-distroless -c "echo has shell"
# Error: exec: "sh": executable file not found in $PATH (exit 1)
```

---

## Automated Validation

```bash
./scripts/test-docker.sh
```

Checks in order:
1. Build all three targets (dev, prod, prod-distroless)
2. Image size table
3. Non-root in prod (alpine) via `id`
4. No shell in prod-distroless (--entrypoint sh fails)
5. Start postgres, wait for healthcheck
6. Verify postgres NOT exposed on host
7. Run migrations one-off container
8. Run seed one-off container
9. Start API, wait for response
10. GraphQL introspection query

---

## Environment Variables

See `.env.example` for all available variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | yes | PostgreSQL host (`postgres` in Docker) |
| `DB_PORT` | yes | PostgreSQL port |
| `DB_USER` | yes | Database user |
| `DB_PASSWORD` | yes | Database password |
| `DB_NAME` | yes | Database name |
| `JWT_SECRET` | yes | JWT signing secret (min 32 chars) |
| `JWT_EXPIRES_IN` | no | JWT expiry (default: `15m`) |
| `AWS_ACCESS_KEY_ID` | yes | AWS / LocalStack key |
| `AWS_SECRET_ACCESS_KEY` | yes | AWS / LocalStack secret |
| `AWS_REGION` | yes | AWS region |
| `AWS_S3_BUCKET` | yes | S3 bucket name |

---

## Local Development (without Docker)

```bash
yarn install
yarn start:dev

yarn migration:run
yarn seed
yarn db:reset    # drop + migrate + seed
```

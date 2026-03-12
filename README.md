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
docker build --target prod -t nestjs-ecommerce:prod .
docker build --target prod-distroless -t nestjs-ecommerce:prod-distroless .
docker image ls nestjs-ecommerce --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
```

Actual results (built on this machine):

```
REPOSITORY         TAG               SIZE
nestjs-ecommerce   prod-distroless   397MB
nestjs-ecommerce   prod              424MB
nestjs-ecommerce   dev               774MB
```

`prod-distroless` is ~7% smaller than `prod` (alpine), and both are roughly half the size of `dev` (which includes all devDependencies, TypeScript compiler, Jest, etc.).

Inspect layers of the production images:

```bash
docker history nestjs-ecommerce:prod-distroless --format "table {{.CreatedBy}}\t{{.Size}}"
```

```
CREATED BY                                       SIZE
CMD ["dist/src/main.js"]                         0B
EXPOSE map[3000/tcp:{}]                          0B
ENV GRAPHQL_SCHEMA_PATH=/tmp/schema.gql          0B
COPY package.json ./                             12.3kB
COPY /app/node_modules ./node_modules            170MB
COPY /app/dist ./dist                            2.58MB
WORKDIR /app                                     8.19kB
bazel build @nodejs22_amd64//:data               124MB
bazel build @bookworm//libssl3/amd64...          5.98MB
bazel build @bookworm//libc6/amd64...            13.4MB
...
```

```bash
docker history nestjs-ecommerce:prod --format "table {{.CreatedBy}}\t{{.Size}}"
```

```
CREATED BY                                       SIZE
CMD ["node" "dist/src/main.js"]                  0B
EXPOSE map[3000/tcp:{}]                          0B
ENV GRAPHQL_SCHEMA_PATH=/tmp/schema.gql          0B
USER appuser                                     0B
COPY --chown=appuser:appgroup package.json ./    12.3kB
COPY --chown=appuser:appgroup node_modules       170MB
COPY --chown=appuser:appgroup dist               2.58MB
RUN addgroup -S appgroup && adduser -S appuser   41kB
WORKDIR /app                                     8.19kB
```

**Why distroless is smaller and safer than alpine:**
- No `/bin/sh`, `/bin/bash` — no shell injection surface
- No `apt`/`apk` — nothing to escalate privileges with
- Only Node.js runtime + minimal libc/SSL from Debian base
- UID 65532 (nonroot) — never runs as root

---

## Non-Root Verification

**prod (alpine stage):**

```bash
docker run --rm nestjs-ecommerce:prod id
# uid=100(appuser) gid=101(appgroup) groups=101(appgroup)
```

**prod-distroless:**

No shell available — cannot run `id`. Non-root is enforced at the image level:

```bash
# Inspect image config
docker inspect nestjs-ecommerce:prod-distroless --format '{{.Config.User}}'
# 65532
```

The base image `gcr.io/distroless/nodejs22-debian12:nonroot` sets `USER` to UID 65532 unconditionally. Our Dockerfile does not override `USER`, so `:nonroot` guarantees it.

Confirm no shell exists:

```bash
docker run --rm --entrypoint sh nestjs-ecommerce:prod-distroless -c "echo has shell"
# exec: "sh": executable file not found in $PATH (exit 1)
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

---

## gRPC — Payments Service

The project consists of **two independent processes**:

| Process | Command | Default port | Description |
|---------|---------|-------------|-------------|
| **orders-service** (HTTP API) | `yarn start:dev` | `3000` | REST API + GraphQL + queue worker |
| **payments-service** (gRPC) | `yarn start:payments-grpc` | `50051` | Handles Authorize / GetPaymentStatus |

### Proto contract

Located at [`proto/payments.proto`](proto/payments.proto) — the single source of truth.

```
proto/
└── payments.proto          ← shared contract (proto3)

src/
├── payments-grpc/          ← gRPC SERVER entrypoint
│   ├── main.ts             ← NestFactory.createMicroservice()
│   ├── payments-grpc.module.ts
│   ├── payments-grpc.controller.ts  ← @GrpcMethod handlers
│   └── payments-grpc.service.ts     ← in-memory storage
│
└── orders/
    ├── payments-grpc-client.interfaces.ts  ← TS contract (mirrors proto, no code import)
    ├── orders.module.ts     ← ClientsModule.register (gRPC client)
    └── orders.service.ts    ← calls Payments.Authorize with deadline
```

Orders knows Payments **only** through the proto contract — no module or class imports from `payments-grpc/`.

### Required environment variables

```bash
# payments-service (gRPC server)
PAYMENTS_GRPC_PORT=50051

# orders-service (gRPC client)
PAYMENTS_GRPC_URL=localhost:50051
PAYMENTS_GRPC_TIMEOUT_MS=5000   # deadline for Authorize calls (ms)
```

### How to run locally

**Terminal 1 — payments-service:**
```bash
PAYMENTS_GRPC_PORT=50051 yarn start:payments-grpc
# → Payments gRPC server listening on :50051
```

**Terminal 2 — orders-service:**
```bash
PAYMENTS_GRPC_URL=localhost:50051 \
PAYMENTS_GRPC_TIMEOUT_MS=5000 \
yarn start:dev
# → Nest application successfully started on port 3000
```

### Happy path: Orders → Payments.Authorize

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "items": [{ "productId": 1, "amount": 1, "price": "100.00" }]
  }'
```

Expected response (HTTP 201):
```json
{
  "id": 1,
  "status": "pending",
  "userId": 1,
  "items": [...],
  "payment": {
    "paymentId": "uuid-v4",
    "status": "AUTHORIZED"
  }
}
```

**payments-service** logs:
```
Authorize ok (paymentId=..., orderId=1, amount=100.00)
```

### Deadline/timeout behavior

The deadline is applied at the gRPC call level via `CallOptions`:

```typescript
// orders/orders.service.ts
const deadline = new Date(Date.now() + timeoutMs); // from PAYMENTS_GRPC_TIMEOUT_MS
firstValueFrom(this.paymentsGrpc.authorize(req, new Metadata(), { deadline }))
```

| gRPC status | HTTP response |
|------------|--------------|
| `DEADLINE_EXCEEDED` | 504 Gateway Timeout |
| `UNAVAILABLE` | 503 Service Unavailable |
| other | 500 Internal Server Error |

---

## RabbitMQ — Queue Topology

### Queues

| Queue | Durable | Purpose |
|-------|---------|---------|
| `orders.process` | yes | Main processing queue — receives new order events |
| `orders.dlq` | yes | Dead-letter queue — receives messages that failed all retry attempts |

> No custom exchanges are used. Both queues use the **default exchange** (direct, empty name). Messages are routed by `routingKey = queueName`.

### Message format (`orders.process`)

```json
{
  "messageId": "uuid-v4",
  "orderId": 42,
  "attempt": 1
}
```

- `messageId` — idempotency key, stored in `processed_messages` table
- `attempt` — incremented on each retry (1-based); when `attempt >= 3` → DLQ

### Retry policy

| Attempt | Delay before re-publish |
|---------|------------------------|
| 1 → 2 | 1 000 ms |
| 2 → 3 | 2 000 ms |
| 3 → DLQ | — |

---

## Scenario Walkthroughs

### Prerequisites

```bash
# Start RabbitMQ + PostgreSQL + API
docker compose up -d rabbitmq postgres
docker compose run --rm migrate
WORKERS_ENABLED=true docker compose up -d api

# Or locally:
RABBITMQ_URL=amqp://guest:guest@localhost:5672 WORKERS_ENABLED=true yarn start:dev
```

---

### Scenario 1 — Happy path (PENDING → PROCESSED)

```bash
# Create order
curl -X POST http://localhost:8080/orders
# → { "id": 1, "status": "pending" }

# Poll until processed (worker picks up within seconds)
curl http://localhost:8080/orders/1
# → { "id": 1, "status": "processed", "processedAt": "..." }
```

Expected logs:
```
Orders worker subscribed: orders.process
Orders worker success (messageId=..., orderId=1, attempt=1)
```

---

### Scenario 2 — Retry (transient failure)

```bash
# Publish a message that simulates transient failure on attempts 1-2
# (requires direct RabbitMQ access or a test endpoint)
curl -X POST http://localhost:8080/orders/test/publish \
  -H "Content-Type: application/json" \
  -d '{"orderId": 2, "simulate": "failTwice"}'
```

Expected logs:
```
Orders worker failed  (messageId=..., orderId=2, attempt=1): simulated failure
Orders worker retry   (messageId=..., orderId=2, attempt=2, delayMs=1000)
Orders worker failed  (messageId=..., orderId=2, attempt=2): simulated failure
Orders worker retry   (messageId=..., orderId=2, attempt=3, delayMs=2000)
Orders worker success (messageId=..., orderId=2, attempt=3)
```

---

### Scenario 3 — DLQ (all attempts exhausted)

```bash
# Publish a message that always fails
curl -X POST http://localhost:8080/orders/test/publish \
  -H "Content-Type: application/json" \
  -d '{"orderId": 3, "simulate": "alwaysFail"}'
```

Expected logs:
```
Orders worker failed (messageId=..., orderId=3, attempt=1)
Orders worker retry  (messageId=..., orderId=3, attempt=2, delayMs=1000)
Orders worker failed (messageId=..., orderId=3, attempt=2)
Orders worker retry  (messageId=..., orderId=3, attempt=3, delayMs=2000)
Orders worker failed (messageId=..., orderId=3, attempt=3)
Orders worker DLQ    (messageId=..., orderId=3, attempt=3)
```

Verify DLQ received the message (Management UI or CLI):
```bash
# Via rabbitmqctl
rabbitmqctl list_queues name messages
# orders.dlq  1

# Peek at DLQ message
rabbitmqadmin get queue=orders.dlq count=1
```

---

### Scenario 4 — Idempotency (duplicate delivery)

```bash
# Publish the same messageId twice
MSG_ID=$(uuidgen)
for i in 1 2; do
  rabbitmqadmin publish \
    routing_key=orders.process \
    payload="{\"messageId\":\"$MSG_ID\",\"orderId\":4,\"attempt\":1}"
done
```

Expected: order processed exactly once, second delivery silently acked.

Verify in DB:
```sql
SELECT COUNT(*) FROM processed_messages WHERE message_id = '<MSG_ID>';
-- 1  (not 2)
```

---

## RabbitMQ Management UI

Default URL: **http://localhost:15672** (user: `guest`, password: `guest`)

### What to look at

| Tab | How to use |
|-----|-----------|
| **Queues** | See `orders.process` and `orders.dlq`, message counts (Ready / Unacked / Total) |
| **Queues → orders.process → Get messages** | Peek at queued messages without consuming |
| **Queues → orders.dlq → Get messages** | Inspect failed messages after DLQ scenario |
| **Overview → Message rates** | Publish / deliver / ack rates graph |

### Enable Management plugin (if not running)

```bash
rabbitmq-plugins enable rabbitmq_management
# Restart RabbitMQ, then open http://localhost:15672
```

Docker Compose expose port:
```yaml
# In compose.yml — add under rabbitmq service:
ports:
  - "5672:5672"    # AMQP
  - "15672:15672"  # Management UI
```

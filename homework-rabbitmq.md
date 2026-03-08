# Homework: RabbitMQ — Order Processing Queue

## Stack

- **amqplib** — raw AMQP client (no framework wrapper)
- **RabbitMQ 3** with Management UI
- **Variant A** retry: republish + ACK (never NACK+requeue, avoids infinite loops)
- **Outbox pattern** for reliable event propagation

---

## Queue Topology

```
POST /orders
     │
     ▼
[OrdersService.create()]
     │  publishToQueue (fire-and-forget)
     ▼
╔══════════════════╗
║  orders.process  ║  ← durable queue
╚══════════════════╝
     │
     ▼
[OrdersWorkerService] ─── consume (noAck: false, prefetch: 10)
     │
     ├─ success ──────────────────────────────► ACK
     │                                          UPDATE orders SET status='processed'
     │                                          INSERT outbox_messages
     │
     ├─ error, attempt < 3 ──────────────────► republish (attempt+1) → ACK
     │
     └─ error, attempt >= 3 ─────────────────► orders.dlq → ACK
                                                (manual inspection required)
```

### Queues

| Queue            | Durable | Purpose                       |
|------------------|---------|-------------------------------|
| `orders.process` | yes     | Main processing queue         |
| `orders.dlq`     | yes     | Dead-letter queue (failed ×3) |

---

## How to Run

### Prerequisites

Make sure you have Docker Compose installed.

### Start

```bash
# First run: bring up all services
docker compose up -d postgres rabbitmq
docker compose run --rm migrate
docker compose run --rm seed
docker compose up -d api

# Dev mode (hot reload + LocalStack S3)
docker compose -f compose.yml -f compose.dev.yml up --build
```

### Verify services are up

```bash
# API
curl http://localhost:8080/health

# RabbitMQ Management UI
open http://localhost:15672
# Login: guest / guest
```

---

## Retry Mechanism (Variant A)

```
Message arrives → attempt=1

  handler succeeds → ACK ✓

  handler fails
    └─ attempt < 3  → publishToQueue('orders.process', {..., attempt: attempt+1}) → ACK
    └─ attempt >= 3 → publishToQueue('orders.dlq', {...}) → ACK
```

**Why Variant A (republish + ACK) and not NACK+requeue?**

- `nack(msg, false, true)` puts the message back at the front of the queue
- It creates an infinite tight loop if the handler keeps failing
- Republishing with an explicit `attempt` counter gives full control

**Key invariant**: `ch.ack()` is always called — never leave a message unacknowledged.

---

## Demo Scenarios

### 1. Happy Path

```bash
curl -s -X POST http://localhost:8080/orders \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": 1,
    "items": [{"productId": 1, "amount": 1, "price": 100, "discount": 0}],
    "idempotencyKey": "demo-happy-1"
  }'
```

**Expected:**
- `201 Created` with `status: "pending"`
- Worker logs: `Orders worker success (messageId=..., orderId=..., attempt=1)`
- Order status in DB changes to `processed`
- `outbox_messages` gets a new `ORDER_PROCESSED` row
- Management UI: `orders.process` shows 1 ready → 0 ready after processing

---

### 2. Retry + eventual success

Use `simulate: "alwaysFail"` to trigger retries. This field can be added to the queue message payload directly for testing.

In the worker logs you will see:
```
Orders worker failed (messageId=..., orderId=..., attempt=1): Simulated processing error
Orders worker retry  (messageId=..., orderId=..., attempt=2)
Orders worker failed (messageId=..., orderId=..., attempt=2): ...
Orders worker retry  (messageId=..., orderId=..., attempt=3)
```

---

### 3. DLQ — exhausted retries

When `attempt` reaches 3 and processing still fails:

```
Orders worker DLQ (messageId=..., orderId=..., attempt=3)
```

**Verify in Management UI:**
- Navigate to **Queues → orders.dlq**
- Click **Get messages** → you will see the failed message with its payload

---

### 4. Idempotency — duplicate message

When the same `messageId` is received twice (e.g., worker crashed after processing but before ACK, causing redelivery):

1. First delivery: `INSERT INTO processed_messages` succeeds → order updated → ACK
2. Second delivery: `INSERT` throws `23505` (unique violation) → skip → ACK (no duplicate update)

**Verify:**
```sql
SELECT * FROM processed_messages WHERE message_id = '<your-messageId>';
-- Returns exactly 1 row regardless of how many times the message was delivered
```

---

## Management UI Walkthrough

Open **http://localhost:15672** (guest/guest):

| Section           | What to check                                               |
|-------------------|-------------------------------------------------------------|
| Overview          | Connection count, message rates                             |
| Queues            | `orders.process` and `orders.dlq` — message counts         |
| orders.process    | Ready / Unacked counters during active processing           |
| orders.dlq        | Inspect failed messages via "Get messages"                  |
| Connections       | One connection from the NestJS API                          |

---

## Environment Variables

```env
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_PREFETCH=10
WORKERS_ENABLED=true
```

| Variable           | Default                               | Description                          |
|--------------------|---------------------------------------|--------------------------------------|
| `RABBITMQ_URL`     | `amqp://guest:guest@localhost:5672`   | AMQP connection string               |
| `RABBITMQ_PREFETCH`| `10`                                  | Max unacked messages per consumer    |
| `WORKERS_ENABLED`  | `true`                                | Set `false` in tests to skip consume |

---

## Database Schema (new tables)

### `orders` table additions

```sql
-- Migration: 1700000007000-add-order-processed-fields.ts
ALTER TABLE orders ADD COLUMN processed_at TIMESTAMPTZ NULL;
ALTER TYPE order_status_enum ADD VALUE 'processed';
```

### `processed_messages`

```sql
-- Migration: 1700000008000-add-processed-messages.ts
CREATE TABLE processed_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           VARCHAR(100) NOT NULL,
  message_id      VARCHAR(200) NOT NULL,
  idempotency_key VARCHAR(200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT UQ_processed_messages_message_id UNIQUE (message_id),
  CONSTRAINT UQ_processed_messages_idempotency_key UNIQUE (idempotency_key)
    WHERE idempotency_key IS NOT NULL
);
```

### `outbox_messages`

```sql
CREATE TABLE outbox_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            VARCHAR(100) NOT NULL,
  payload         JSONB NOT NULL,
  status          outbox_status_enum NOT NULL DEFAULT 'pending',
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Outbox Pattern

The `ORDER_PROCESSED` domain event is written to `outbox_messages` **inside the same transaction** as the order status update. A background relay (`OutboxRelayService`) polls unpublished rows and publishes them to the message broker — guaranteeing at-least-once delivery without two-phase commit.

```
Transaction:
  INSERT processed_messages
  UPDATE orders SET status='processed'
  INSERT outbox_messages (type='ORDER_PROCESSED', status='pending')
  COMMIT ──── atomic

OutboxRelayService (setInterval):
  SELECT ... FROM outbox_messages WHERE status='pending' FOR UPDATE SKIP LOCKED
  publishToQueue(...)
  UPDATE outbox_messages SET status='published'
```

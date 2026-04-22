# FinOps Homework Summary — NestJS E-Commerce API

## Обраний сценарій

**`GET /orders`** — список замовлень (адмін-панель)

- Найчастіший read-endpoint в e-commerce адмінці
- Відтворюваний без side effects
- Не залежить від зовнішніх сервісів (gRPC, S3)
- Навантаження: 50 concurrent connections, 30 секунд (`npx autocannon -c 50 -d 30`)

---

## Baseline (до змін)

```
Сценарій: GET /orders
Навантаження: 50 concurrent connections, 30s

p50 latency:   48 ms
p95 latency:   84 ms
p99 latency:  108 ms
Throughput:   938 req/s
Error rate:     0 %
```

**Скріншоти:**
- `screenshots/01-baseline-autocannon.png` — результати autocannon
- `screenshots/02-baseline-cpu-mem.png` — CPU/MEM під навантаженням
- `screenshots/03-pg_stat_before.png` — pg_stat_statements (2 queries per request)

---

## Bottleneck

### Що знайшли

**2 DB queries на кожен `GET /orders` запит** через `relations: { items: true }` в `OrdersService.findAll()`.

```typescript
// src/orders/orders.service.ts — до змін
return this.orderRepository.find({
  where,
  relations: { items: true },   // ← зайвий JOIN/subquery
  skip: offset,
  take: limit,
  order: { createdAt: 'DESC' },
});
```

TypeORM при `find()` з `relations` і пагінацією генерує:
1. `SELECT DISTINCT "distinctAlias"."Order_id"...` — підзапит для пагінації (32146 calls)
2. `SELECT "Order"."id"...` — основний SELECT з усіма колонками (32146 calls)

**Overfetch**: завантажуються всі колонки `orders` + всі рядки `order_items` для кожної сторінки, хоча список замовлень показує тільки id, status, userId, createdAt.

### Підтвердження через дані

`pg_stat_statements` до змін:
```
SELECT DISTINCT "distinctAlias"."Order_id"...  | 32146 calls | 0.06 ms avg
SELECT "Order"."id"...                          | 32146 calls | 0.07 ms avg
```

→ рівно 2 queries на кожен HTTP запит.

**Скріншот:** `screenshots/03-pg_stat_before.png`

---

## Реалізовані покращення

### 1. Performance: Projection + прибрання relations з findAll()

**Файл:** `src/orders/orders.service.ts`

Замінено `find({ relations: { items: true } })` на QueryBuilder із projection:

```typescript
// після змін
const qb = this.orderRepository
  .createQueryBuilder('order')
  .select([
    'order.id', 'order.orderNumber', 'order.status',
    'order.userId', 'order.addressId', 'order.idempotencyKey', 'order.createdAt',
  ])
  .orderBy('order.createdAt', 'DESC')
  .skip(offset)
  .take(limit);
```

**Ефект:**
- 2 queries → 1 query на кожен запит
- Завантажуються тільки 7 потрібних колонок замість усіх
- avg_ms запиту: 0.07ms → 0.02ms (3.5x швидше)

### 2. Cost/Runtime: Adaptive polling у OutboxRelayService

**Файл:** `src/outbox/outbox-relay.service.ts`

Замінено фіксований `setInterval(1000)` на адаптивний `setTimeout` з exponential backoff:

```
Idle (черга пуста):  1s → 2s → 4s → 8s → 10s (max)
Active (є повідомлення): скидається до 1s
```

**Ефект:**
- Idle DB polls: ~60/хв → ~8-10/хв (85% reduction)
- `pg_stat_statements` підтвердив: ~81 outbox queries замість ~300+ за той самий проміжок

---

## Before / After

| Метрика | До | Після | Коментар |
|---------|-----|-------|----------|
| p50 latency | 48 ms | 37 ms | -23% |
| p95 latency | 84 ms | 58 ms | -31% |
| p99 latency | 108 ms | 66 ms | **-39%** |
| Throughput | 938 req/s | 1270 req/s | +35% |
| Error rate | 0% | 0% | — |
| DB queries / запит | 2 | 1 | -50% DB round-trips |
| Query avg_ms | 0.07 ms | 0.02 ms | 3.5x швидше |
| Outbox idle polls/хв | ~60 | ~8–10 | -85% idle DB load |

**Скріншоти after:**
- `screenshots/04-after-autocannon.png`
- `screenshots/05-after-cpu-mem.png`
- `screenshots/06-pg_stat_after.png`

---

## Trade-offs і продакшен-мислення

### Зміна 1: Projection + без relations у findAll()

**Що покращили:** p99 -39%, throughput +35%, вдвічі менше DB round-trips на кожен запит списку замовлень.

**Компроміс:** `GET /orders` більше не повертає `items` у відповіді. Якщо клієнт (frontend або API consumer) очікував order items у списку — потрібен окремий `GET /orders/:id` або GraphQL query з `items` field. Це breaking change в response schema.

**За що заплатили:** трохи складніший код (QueryBuilder vs простий `find()`); якщо потрібні items у списку — ще один HTTP round-trip на клієнті.

**Моніторинг у проді:** відслідковувати `pg_stat_statements` → якщо avg_ms для orders SELECT раптово зростає, значить index miss або таблиця різко виросла. Алерт на p99 > 150ms для цього endpoint.

### Зміна 2: Adaptive outbox polling

**Що покращили:** 85% менше idle DB connections від outbox relay — пряма економія на DB connection pool і I/O cost. В cloud (RDS) менше зайвих round-trips = менший bill.

**Компроміс:** event latency при idle може зрости до 10s (замість 1s). Для `ORDER_PROCESSED` доменних подій це прийнятно. Але якщо додати критичну подію (наприклад, `PAYMENT_FAILED` → негайний алерт), потрібен або окремий relay з меншим max interval, або push-based notify (LISTEN/NOTIFY від PostgreSQL).

**За що заплатили:** складніша логіка relay (адаптивний setTimeout замість простого setInterval); важче дебажити поведінку інтервалу без метрики `outbox_relay_current_interval_ms`.

**Моніторинг у проді:** gauge метрика поточного інтервалу + алерт якщо `domain.events` queue depth в RabbitMQ росте (значить relay не встигає).

### FinOps-висновок

Обидві зміни зменшують cost на рівні DB без додаткової інфраструктури. При горизонтальному масштабуванні (N replicas) ефект множиться: N × 60 idle outbox queries/хв → N × 8 queries/хв. При 10 репліках — 600 → 80 queries/хв тільки від outbox. В cloud це пряма економія на RDS I/O та connection limits.

---

## Як відтворити

```bash
cd /home/dell/projects/nestjs

# 1. Запустити стек
docker compose up -d postgres rabbitmq
docker compose run --rm migrate
docker compose run --rm seed
docker compose up -d api

# 2. Перевірити health
curl http://localhost:8082/health

# 3. Load test
npx autocannon -c 50 -d 30 http://localhost:8082/orders

# 4. DB query analysis
docker exec -it nestjs-ecommerce-postgres-1 psql -U postgres -d nestjs-db -c \
  "SELECT LEFT(query, 80) as q, calls, round(mean_exec_time::numeric,2) as avg_ms FROM pg_stat_statements ORDER BY calls DESC LIMIT 10;"

# 5. CPU/MEM моніторинг (під час load test)
watch -n1 'docker stats --no-stream --format "{{.Name}}\tCPU: {{.CPUPerc}}\tMEM: {{.MemUsage}}"'
```

---

## Зміни в коді

| Файл | Зміна | Тип |
|------|-------|-----|
| `src/orders/orders.service.ts` | `findAll()` і `findAllWithCount()`: `find({relations})` → QueryBuilder з projection | Performance |
| `src/outbox/outbox-relay.service.ts` | `setInterval(1000)` → adaptive `setTimeout` з backoff 1s–10s | Cost/Runtime |
| `compose.yml` | `RABBITMQ_URL` override для Docker; `THROTTLE_GLOBAL/STRICT_LIMIT` для dev load testing; port 8082 | Config |

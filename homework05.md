# Homework 05

## Part 1 — Transactional Order Creation

### Transaction

`QueryRunner` with `try / catch / finally` — rollback on error, `release()` always.

### Idempotency

`idempotencyKey` in body → partial unique index in DB; duplicate returns existing order (200), race condition via 23505 is also handled.

### Concurrency — pessimistic locking

`FOR NO KEY UPDATE` via `.setLock('pessimistic_write')` — locks stock rows for the transaction duration, doesn't block FK lookups; simpler than optimistic (no retry needed).

### Errors

- Insufficient stock → `409 ConflictException` (resource conflict, not invalid input).
- Duplicate `idempotencyKey` → `200` with existing order.
- Other → rollback + `500 InternalServerErrorException`.

## Part 2 — SQL Optimization

### Query

```sql
SELECT o.*, json_agg(oi.*) as items
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'pending'
  AND o.created_at >= '2025-01-01'
  AND o.created_at <= '2025-12-31'
GROUP BY o.id
ORDER BY o.created_at DESC
LIMIT 20 OFFSET 0;
```

### EXPLAIN ANALYZE before

```
Seq Scan on orders o  (cost=0.00..1.09 rows=1 width=290) (actual time=0.004..0.005 rows=0 loops=1)
  Filter: ((created_at >= '2025-01-01') AND (created_at <= '2025-12-31') AND (status = 'pending'))
  Rows Removed by Filter: 5
Planning Time: 2.718 ms
Execution Time: 0.127 ms
```

### Index

```sql
CREATE INDEX idx_orders_status_created_at ON orders (status, created_at DESC);
```

Composite index — `status` as equality filter first, `created_at DESC` for range + ORDER BY.

### EXPLAIN ANALYZE after (with enable_seqscan = off)

```
Index Scan using idx_orders_status_created_at on orders o  (cost=0.13..8.15 rows=1 width=290) (actual time=0.027..0.027 rows=0 loops=1)
  Index Cond: ((status = 'pending') AND (created_at >= '2025-01-01') AND (created_at <= '2025-12-31'))
Planning Time: 0.673 ms
Execution Time: 0.130 ms
```

### Conclusion

With 5 rows the planner picks Seq Scan because it's cheaper than random I/O index scan — this is correct behavior. With `enable_seqscan = off` the index works: `Index Scan using idx_orders_status_created_at` with Index Cond on both columns. On real data volume (thousands+ rows) the planner will automatically switch to Index Scan.

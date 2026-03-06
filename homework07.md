# Homework 07 — GraphQL API for Orders

## Approach: Code-First

## Schema

### Types

- **`OrderType`** — `id`, `orderNumber`, `userId`, `status` (enum), `createdAt`, `items`
- **`OrderItemType`** — `id`, `productId`, `amount`, `price`, `discount`, `product`
- **`ProductType`** — `id`, `name`, `slug`, `brand`, `price`, `createdAt`
- **`OrderStatus`** enum — `PENDING`, `PROCESSING`, `COMPLETE`, `CANCELED`

### Pagination

`OrdersConnection { nodes, totalCount, pageInfo { hasNextPage } }` — chosen over a bare array because it gives the client `totalCount` for UI pagination and `hasNextPage` to know when to stop fetching.

### Inputs

- **`OrdersFilterInput`** — optional `status`, `dateFrom`, `dateTo`
- **`OrdersPaginationInput`** — `limit` (1–50, default 10), `offset` (default 0)

## Resolvers

Resolvers are thin — they delegate entirely to existing services:

- `OrdersResolver.getOrders()` → calls `OrdersService.findAllWithCount()`
- `OrderItemResolver.getProduct()` → calls `ProductLoader.load()` (DataLoader)

## DataLoader

`ProductLoader` is request-scoped (`Scope.REQUEST`). It batches all `productId` lookups within a single GraphQL request into one `SELECT ... WHERE id IN (...)` query via `ProductsService.findByIds()`.

### N+1 proof: before vs after DataLoader

**Without DataLoader** — `OrderItemResolver` would call `productsService.findOne(id)` per item.
For a response with 5 orders × 3 items each = 15 items, the server issues **16 SQL queries**:

```
query 1:  SELECT ... FROM orders LEFT JOIN order_items ...
query 2:  SELECT * FROM products WHERE id = 1
query 3:  SELECT * FROM products WHERE id = 2
query 4:  SELECT * FROM products WHERE id = 2   ← duplicate
query 5:  SELECT * FROM products WHERE id = 3
...
query 16: SELECT * FROM products WHERE id = 5
```

**With DataLoader** — all `productId` values across all 15 items are collected in one tick,
then resolved in a **single batched query**. Total: **2 SQL queries**:

```
query 1:  SELECT ... FROM orders LEFT JOIN order_items ...
query 2:  SELECT * FROM products WHERE id IN (1, 2, 3, 4, 5)
```

DataLoader also deduplicates keys within the batch (e.g., if two items share the same `productId`,
`findByIds` is still called once for that id). This is tested in
`src/graphql/orders/__tests/product.loader.spec.ts` (batching + deduplication cases).

## Additional GraphQL APIs

Following the same pattern as Orders, GraphQL APIs were added for the remaining entities: **Products**, **Payments**, **Shipping**, **Stocks**, **Users**. Each module includes types, connection-based pagination, filter inputs, and a resolver delegating to the corresponding service.

## Error Handling

- Invalid filter/pagination values → GraphQL validation error (class-validator via `ValidationPipe`)
- No results → empty `nodes: []`, `totalCount: 0`
- DB/service errors → caught by NestJS, returned as standard GraphQL error with message logged server-side

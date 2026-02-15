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

## Error Handling

- Invalid filter/pagination values → GraphQL validation error (class-validator via `ValidationPipe`)
- No results → empty `nodes: []`, `totalCount: 0`
- DB/service errors → caught by NestJS, returned as standard GraphQL error with message logged server-side

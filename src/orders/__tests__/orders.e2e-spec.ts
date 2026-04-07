/**
 * Orders E2E Tests
 *
 * Seed data context:
 *   Products (upserted, stable IDs):
 *     id=1 iPhone(49999), id=2 Samsung(47999), id=3 MacBook(52999),
 *     id=4 Sony(12999), id=5 Logitech(4299)
 *
 *   Stocks (upserted, stable):
 *     product 1 -> stock:20/reserved:0
 *     product 2 -> stock:40/reserved:2
 *     product 3 -> stock:60/reserved:4
 *     product 4 -> stock:80/reserved:6
 *     product 5 -> stock:100/reserved:8
 *
 *   Orders (created via `save`, IDs may vary across runs):
 *     order1(complete,user1), order2(pending,user1), order3(processing,user2),
 *     order4(pending,user3), order5(canceled,user2)
 *
 *   Order Items:
 *     order1 -> [prod1x1, prod4x2]
 *     order2 -> [prod3x1]
 *     order3 -> [prod2x1, prod5x3]
 *     order4 -> [prod1x2, prod4x1, prod5x1]
 *     order5 -> [prod2x1]
 *
 * IMPORTANT: Order IDs are not guaranteed to be 1-5. Tests that need
 * existing orders fetch them via GET first to obtain real IDs.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { of } from 'rxjs';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { PAYMENTS_GRPC_CLIENT } from '../orders.constants';

/** Stub gRPC client — returns a synthetic authorize response without a real gRPC server */
const mockPaymentsGrpcClient = {
  getService: () => ({
    authorize: () => of({ paymentId: 'mock-payment-id', status: 'PENDING' }),
  }),
};

describe('OrdersController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PAYMENTS_GRPC_CLIENT)
      .useValue(mockPaymentsGrpcClient)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // GET /orders
  // ---------------------------------------------------------------
  describe('GET /orders', () => {
    it('should return an array of orders with items', async () => {
      const res = await request(app.getHttpServer()).get('/orders');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const order = res.body[0];
      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('userId');
      expect(order).toHaveProperty('status');
      expect(order).toHaveProperty('items');
      expect(Array.isArray(order.items)).toBe(true);
    });

    it('should filter orders by status=pending', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders')
        .query({ status: 'pending' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      for (const order of res.body) {
        expect(order.status).toBe('pending');
      }
    });

    it('should filter orders by userId', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders')
        .query({ userId: 1 });

      expect(res.status).toBe(200);
      for (const order of res.body) {
        expect(order.userId).toBe(1);
      }
    });

    it('should respect limit and offset', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders')
        .query({ limit: 2, offset: 0 });

      expect(res.status).toBe(200);
      expect(res.body.length).toBeLessThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------
  // GET /orders/:id
  // ---------------------------------------------------------------
  describe('GET /orders/:id', () => {
    it('should return a single order with items, payments, and shipments', async () => {
      // Fetch an existing order id dynamically
      const allRes = await request(app.getHttpServer()).get('/orders?limit=1');
      const orderId = allRes.body[0].id;

      const res = await request(app.getHttpServer()).get(`/orders/${orderId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', orderId);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('payments');
      expect(res.body).toHaveProperty('shipments');
    });

    it('should return 404 for non-existent order', async () => {
      const res = await request(app.getHttpServer()).get('/orders/99999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message');
    });
  });

  // ---------------------------------------------------------------
  // POST /orders — happy path
  // ---------------------------------------------------------------
  describe('POST /orders', () => {
    it('should create a new order with items and return 201', async () => {
      // Read stock before creation
      const stockBefore = await request(app.getHttpServer()).get('/stocks/product/4');
      const reservedBefore = stockBefore.body.reserved;

      const idempotencyKey = randomUUID();
      const dto = {
        userId: 1,
        idempotencyKey,
        items: [
          { productId: 4, amount: 1, price: 12999 },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/orders')
        .send(dto);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.userId).toBe(1);
      expect(res.body.status).toBe('pending');
      expect(res.body.items).toHaveLength(1);
      expect(Number(res.body.items[0].productId)).toBe(4);
      expect(res.body.items[0].amount).toBe(1);

      // Verify stock.reserved was incremented
      const stockAfter = await request(app.getHttpServer()).get('/stocks/product/4');
      expect(stockAfter.body.reserved).toBe(reservedBefore + 1);
    });

    it('should return the same order (200) when using duplicate idempotencyKey', async () => {
      const idempotencyKey = randomUUID();
      const dto = {
        userId: 1,
        idempotencyKey,
        items: [
          { productId: 5, amount: 1, price: 4299 },
        ],
      };

      // First request -> 201
      const first = await request(app.getHttpServer())
        .post('/orders')
        .send(dto);
      expect(first.status).toBe(201);

      // Second request with same key -> 200 (idempotent)
      const second = await request(app.getHttpServer())
        .post('/orders')
        .send(dto);
      expect(second.status).toBe(200);
      expect(second.body.id).toBe(first.body.id);
    });

    it('should return 409 when stock is insufficient', async () => {
      const dto = {
        userId: 1,
        items: [
          // Request way more than available stock for product 1 (stock=20)
          { productId: 1, amount: 99999, price: 49999 },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/orders')
        .send(dto);

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toContain('Insufficient stock');
    });

    it('should return 400 when items array is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({
          userId: 1,
          items: [],
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // PATCH /orders/:id/status
  // ---------------------------------------------------------------
  describe('PATCH /orders/:id/status', () => {
    it('should transition a pending order to processing', async () => {
      // Create a fresh pending order to transition
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .send({
          userId: 1,
          items: [{ productId: 5, amount: 1, price: 4299 }],
        });
      expect(createRes.status).toBe(201);
      const orderId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .send({ status: 'processing' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('processing');
    });

    it('should transition a pending order to canceled', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .send({
          userId: 1,
          items: [{ productId: 5, amount: 1, price: 4299 }],
        });
      const orderId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .send({ status: 'canceled' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('canceled');
    });

    it('should return 400 for invalid status transition (pending -> complete)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .send({
          userId: 1,
          items: [{ productId: 5, amount: 1, price: 4299 }],
        });
      const orderId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .send({ status: 'complete' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toContain('Cannot transition');
    });

    it('should return 400 for invalid status transition on terminal state (canceled)', async () => {
      // Create and cancel an order
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .send({
          userId: 1,
          items: [{ productId: 5, amount: 1, price: 4299 }],
        });
      const orderId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .send({ status: 'canceled' });

      // Try to transition canceled -> processing
      const res = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/status`)
        .send({ status: 'processing' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot transition');
    });

    it('should return 404 for non-existent order', async () => {
      const res = await request(app.getHttpServer())
        .patch('/orders/99999/status')
        .send({ status: 'processing' });

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------
  // DELETE /orders/:id
  // ---------------------------------------------------------------
  describe('DELETE /orders/:id', () => {
    it('should delete an order and return 204', async () => {
      // Create a throwaway order to delete
      const createRes = await request(app.getHttpServer())
        .post('/orders')
        .send({
          userId: 1,
          items: [{ productId: 5, amount: 1, price: 4299 }],
        });
      const orderId = createRes.body.id;

      const res = await request(app.getHttpServer()).delete(`/orders/${orderId}`);

      expect(res.status).toBe(204);

      // Confirm deletion
      const getRes = await request(app.getHttpServer()).get(`/orders/${orderId}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent order', async () => {
      const res = await request(app.getHttpServer()).delete('/orders/99999');

      expect(res.status).toBe(404);
    });
  });
});

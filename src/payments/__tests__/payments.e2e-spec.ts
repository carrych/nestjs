/**
 * Payments E2E Tests
 *
 * Seed data context:
 *   Payments (linked to seed orders, order IDs may vary):
 *     order1 -> received, bank_transfer, amount=75497
 *     order3 -> pending, cash_on_delivery, amount=58896
 *     order5 -> failed, cash, amount=47999
 *
 *   Payment enums:
 *     status: pending | ready | received | failed
 *     type:   in | out
 *     method: cash | cash_on_delivery | bank_transfer
 *
 * IMPORTANT: Tests create their own orders for POST operations
 * to avoid dependency on seed order IDs.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';

describe('PaymentsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper: create an order to use for payment tests
  async function createTestOrder(): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .send({
        userId: 500,
        items: [{ productId: 5, amount: 1, price: 4299 }],
      });
    return res.body.id;
  }

  // ---------------------------------------------------------------
  // GET /payments
  // ---------------------------------------------------------------
  describe('GET /payments', () => {
    it('should return an array of payments', async () => {
      const res = await request(app.getHttpServer()).get('/payments');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const payment = res.body[0];
      expect(payment).toHaveProperty('id');
      expect(payment).toHaveProperty('orderId');
      expect(payment).toHaveProperty('amount');
      expect(payment).toHaveProperty('status');
      expect(payment).toHaveProperty('method');
      expect(payment).toHaveProperty('order');
    });

    it('should filter payments by orderId', async () => {
      // Get an existing payment to find its orderId
      const allRes = await request(app.getHttpServer()).get('/payments');
      const existingOrderId = allRes.body[0].orderId;

      const res = await request(app.getHttpServer())
        .get('/payments')
        .query({ orderId: existingOrderId });

      expect(res.status).toBe(200);
      for (const payment of res.body) {
        expect(Number(payment.orderId)).toBe(Number(existingOrderId));
      }
    });

    it('should filter payments by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/payments')
        .query({ status: 'received' });

      expect(res.status).toBe(200);
      for (const payment of res.body) {
        expect(payment.status).toBe('received');
      }
    });
  });

  // ---------------------------------------------------------------
  // GET /payments/:id
  // ---------------------------------------------------------------
  describe('GET /payments/:id', () => {
    it('should return a single payment with order relation', async () => {
      const allRes = await request(app.getHttpServer()).get('/payments?limit=1');
      const paymentId = allRes.body[0].id;

      const res = await request(app.getHttpServer()).get(`/payments/${paymentId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', paymentId);
      expect(res.body).toHaveProperty('order');
      expect(res.body).toHaveProperty('amount');
      expect(res.body).toHaveProperty('method');
    });

    it('should return 404 for non-existent payment', async () => {
      const res = await request(app.getHttpServer()).get('/payments/99999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message');
    });
  });

  // ---------------------------------------------------------------
  // POST /payments
  // ---------------------------------------------------------------
  describe('POST /payments', () => {
    it('should create a new payment and return 201', async () => {
      const orderId = await createTestOrder();

      const dto = {
        orderId,
        userId: 500,
        amount: 4299,
        method: 'bank_transfer',
        status: 'pending',
        type: 'in',
        transactionNumber: 'TXN-E2E-001',
      };

      const res = await request(app.getHttpServer())
        .post('/payments')
        .send(dto);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(Number(res.body.orderId)).toBe(orderId);
      expect(res.body.method).toBe('bank_transfer');
      expect(res.body.status).toBe('pending');
      expect(Number(res.body.amount)).toBe(4299);
    });

    it('should return 404 when orderId does not exist', async () => {
      const res = await request(app.getHttpServer())
        .post('/payments')
        .send({
          orderId: 99999,
          userId: 500,
          amount: 1000,
          method: 'cash',
        });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/payments')
        .send({ userId: 500 });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // PATCH /payments/:id
  // ---------------------------------------------------------------
  describe('PATCH /payments/:id', () => {
    it('should update payment status', async () => {
      // Create a payment to update
      const orderId = await createTestOrder();
      const createRes = await request(app.getHttpServer())
        .post('/payments')
        .send({
          orderId,
          userId: 500,
          amount: 5000,
          method: 'cash',
          status: 'pending',
        });
      const paymentId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/payments/${paymentId}`)
        .send({ status: 'received' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('received');
    });

    it('should update payment amount and method', async () => {
      const orderId = await createTestOrder();
      const createRes = await request(app.getHttpServer())
        .post('/payments')
        .send({
          orderId,
          userId: 500,
          amount: 1000,
          method: 'cash',
        });
      const paymentId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/payments/${paymentId}`)
        .send({ amount: 2000, method: 'bank_transfer' });

      expect(res.status).toBe(200);
      expect(Number(res.body.amount)).toBe(2000);
      expect(res.body.method).toBe('bank_transfer');
    });

    it('should return 404 when updating non-existent payment', async () => {
      const res = await request(app.getHttpServer())
        .patch('/payments/99999')
        .send({ status: 'received' });

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------
  // DELETE /payments/:id
  // ---------------------------------------------------------------
  describe('DELETE /payments/:id', () => {
    it('should delete a payment and return 204', async () => {
      const orderId = await createTestOrder();
      const createRes = await request(app.getHttpServer())
        .post('/payments')
        .send({
          orderId,
          userId: 500,
          amount: 100,
          method: 'cash',
        });
      const paymentId = createRes.body.id;

      const res = await request(app.getHttpServer()).delete(`/payments/${paymentId}`);

      expect(res.status).toBe(204);

      // Confirm deletion
      const getRes = await request(app.getHttpServer()).get(`/payments/${paymentId}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent payment', async () => {
      const res = await request(app.getHttpServer()).delete('/payments/99999');

      expect(res.status).toBe(404);
    });
  });
});

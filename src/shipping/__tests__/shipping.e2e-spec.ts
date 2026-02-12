/**
 * Shipping E2E Tests
 *
 * Seed data context:
 *   Shipping records (linked to seed orders, order IDs may vary):
 *     order1 -> status=received, tracking=NP-20450001234567
 *     order3 -> status=delivering, tracking=NP-20450009876543
 *     order4 -> status=pending, no tracking number
 *
 *   Shipping status enum:
 *     pending | delivering | arrived | received | refused
 *
 *   Special behavior:
 *     When status is updated to 'received', `receivedAt` is auto-set
 *     to the current timestamp.
 *
 * IMPORTANT: Tests create their own orders for POST operations
 * to avoid dependency on seed order IDs.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';

describe('ShippingController (e2e)', () => {
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

  // Helper: create an order to use for shipping tests
  async function createTestOrder(): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .send({
        userId: 600,
        items: [{ productId: 5, amount: 1, price: 4299 }],
      });
    return Number(res.body.id);
  }

  // ---------------------------------------------------------------
  // GET /shipping
  // ---------------------------------------------------------------
  describe('GET /shipping', () => {
    it('should return an array of shipping records with order relation', async () => {
      const res = await request(app.getHttpServer()).get('/shipping');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);

      const shipping = res.body[0];
      expect(shipping).toHaveProperty('id');
      expect(shipping).toHaveProperty('orderId');
      expect(shipping).toHaveProperty('status');
      expect(shipping).toHaveProperty('trackingNumber');
      expect(shipping).toHaveProperty('declaredValue');
      expect(shipping).toHaveProperty('order');
    });

    it('should filter shipping records by orderId', async () => {
      // Get an existing shipping to find its orderId
      const allRes = await request(app.getHttpServer()).get('/shipping');
      const existingOrderId = allRes.body[0].orderId;

      const res = await request(app.getHttpServer())
        .get('/shipping')
        .query({ orderId: existingOrderId });

      expect(res.status).toBe(200);
      for (const shipping of res.body) {
        expect(Number(shipping.orderId)).toBe(Number(existingOrderId));
      }
    });
  });

  // ---------------------------------------------------------------
  // GET /shipping/:id
  // ---------------------------------------------------------------
  describe('GET /shipping/:id', () => {
    it('should return a single shipping record with order relation', async () => {
      const allRes = await request(app.getHttpServer()).get('/shipping');
      const shippingId = allRes.body[0].id;

      const res = await request(app.getHttpServer()).get(`/shipping/${shippingId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', shippingId);
      expect(res.body).toHaveProperty('order');
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('declaredValue');
    });

    it('should return 404 for non-existent shipping record', async () => {
      const res = await request(app.getHttpServer()).get('/shipping/99999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message');
    });
  });

  // ---------------------------------------------------------------
  // POST /shipping
  // ---------------------------------------------------------------
  describe('POST /shipping', () => {
    it('should create a new shipping record and return 201', async () => {
      const orderId = await createTestOrder();

      const dto = {
        orderId,
        userId: 600,
        trackingNumber: 'NP-E2E-TEST-001',
        declaredValue: 4299,
        shippingCost: 150,
        weight: 0.5,
        seatsCount: 1,
        description: 'E2E test shipment',
        status: 'pending',
      };

      const res = await request(app.getHttpServer())
        .post('/shipping')
        .send(dto);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(Number(res.body.orderId)).toBe(orderId);
      expect(res.body.trackingNumber).toBe('NP-E2E-TEST-001');
      expect(res.body.status).toBe('pending');
      expect(Number(res.body.declaredValue)).toBe(4299);
    });

    it('should return 404 when orderId does not exist', async () => {
      const res = await request(app.getHttpServer())
        .post('/shipping')
        .send({
          orderId: 99999,
          userId: 600,
          declaredValue: 1000,
        });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/shipping')
        .send({ userId: 600 });

      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // PATCH /shipping/:id
  // ---------------------------------------------------------------
  describe('PATCH /shipping/:id', () => {
    it('should update shipping tracking number', async () => {
      const orderId = await createTestOrder();
      const createRes = await request(app.getHttpServer())
        .post('/shipping')
        .send({
          orderId,
          userId: 600,
          declaredValue: 1000,
          status: 'pending',
        });
      const shippingId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/shipping/${shippingId}`)
        .send({ trackingNumber: 'NP-UPDATED-001' });

      expect(res.status).toBe(200);
      expect(res.body.trackingNumber).toBe('NP-UPDATED-001');
    });

    it('should set receivedAt when status changes to received', async () => {
      const orderId = await createTestOrder();
      const createRes = await request(app.getHttpServer())
        .post('/shipping')
        .send({
          orderId,
          userId: 600,
          declaredValue: 2000,
          status: 'pending',
        });
      const shippingId = createRes.body.id;

      // Confirm receivedAt is not set initially
      expect(createRes.body.receivedAt ?? null).toBeNull();

      const res = await request(app.getHttpServer())
        .patch(`/shipping/${shippingId}`)
        .send({ status: 'received' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('received');
      expect(res.body.receivedAt).not.toBeNull();

      // Verify receivedAt is a valid date string
      expect(new Date(res.body.receivedAt).getTime()).not.toBeNaN();
    });

    it('should return 404 when updating non-existent shipping', async () => {
      const res = await request(app.getHttpServer())
        .patch('/shipping/99999')
        .send({ status: 'delivering' });

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------
  // DELETE /shipping/:id
  // ---------------------------------------------------------------
  describe('DELETE /shipping/:id', () => {
    it('should delete a shipping record and return 204', async () => {
      const orderId = await createTestOrder();
      const createRes = await request(app.getHttpServer())
        .post('/shipping')
        .send({
          orderId,
          userId: 600,
          declaredValue: 500,
        });
      const shippingId = createRes.body.id;

      const res = await request(app.getHttpServer()).delete(`/shipping/${shippingId}`);

      expect(res.status).toBe(204);

      // Confirm deletion
      const getRes = await request(app.getHttpServer()).get(`/shipping/${shippingId}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent shipping', async () => {
      const res = await request(app.getHttpServer()).delete('/shipping/99999');

      expect(res.status).toBe(404);
    });
  });
});

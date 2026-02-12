/**
 * Stocks E2E Tests
 *
 * Seed data (inserted via upsert, stable product IDs):
 *   product 1 (iPhone)    -> stock: 20, reserved: 0
 *   product 2 (Samsung)   -> stock: 40, reserved: 2
 *   product 3 (MacBook)   -> stock: 60, reserved: 4
 *   product 4 (Sony)      -> stock: 80, reserved: 6
 *   product 5 (Logitech)  -> stock: 100, reserved: 8
 *
 * Note: reserved values may be higher if order creation tests ran
 * before this suite in the same test run. Assertions use flexible checks.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';

describe('StocksController (e2e)', () => {
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

  describe('GET /stocks', () => {
    it('should return all stock records with product relations', async () => {
      const res = await request(app.getHttpServer()).get('/stocks');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(5);

      // Each stock record should have expected fields
      const first = res.body[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('productId');
      expect(first).toHaveProperty('stock');
      expect(first).toHaveProperty('reserved');
      expect(first).toHaveProperty('product');
    });
  });

  describe('GET /stocks/product/:productId', () => {
    it('should return stock for a specific product', async () => {
      // Use product 1 (iPhone), which exists from seed
      const res = await request(app.getHttpServer()).get('/stocks/product/1');

      expect(res.status).toBe(200);
      expect(Number(res.body.productId)).toBe(1);
      expect(res.body).toHaveProperty('stock');
      expect(res.body).toHaveProperty('reserved');
      expect(res.body).toHaveProperty('product');
      expect(res.body.product).toHaveProperty('name');
    });

    it('should return 404 for non-existent product stock', async () => {
      const res = await request(app.getHttpServer()).get('/stocks/product/999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message');
    });
  });

  describe('PATCH /stocks/product/:productId', () => {
    it('should update stock values for a product', async () => {
      // Read current stock for product 5 (Logitech)
      const before = await request(app.getHttpServer()).get('/stocks/product/5');
      const originalStock = before.body.stock;

      const newStockValue = originalStock + 10;
      const res = await request(app.getHttpServer())
        .patch('/stocks/product/5')
        .send({ stock: newStockValue });

      expect(res.status).toBe(200);
      expect(res.body.stock).toBe(newStockValue);
      expect(Number(res.body.productId)).toBe(5);

      // Restore original value
      await request(app.getHttpServer())
        .patch('/stocks/product/5')
        .send({ stock: originalStock });
    });

    it('should update only the reserved field when stock is omitted', async () => {
      const before = await request(app.getHttpServer()).get('/stocks/product/5');
      const originalReserved = before.body.reserved;

      const res = await request(app.getHttpServer())
        .patch('/stocks/product/5')
        .send({ reserved: originalReserved + 1 });

      expect(res.status).toBe(200);
      expect(res.body.reserved).toBe(originalReserved + 1);

      // Restore
      await request(app.getHttpServer())
        .patch('/stocks/product/5')
        .send({ reserved: originalReserved });
    });

    it('should return 404 when updating stock for non-existent product', async () => {
      const res = await request(app.getHttpServer())
        .patch('/stocks/product/999')
        .send({ stock: 50 });

      expect(res.status).toBe(404);
    });
  });
});

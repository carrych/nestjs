/**
 * Products E2E Tests
 *
 * Seed data (inserted by `pretest` script via upsert, so IDs are stable):
 *   id=1  iPhone    price=49999
 *   id=2  Samsung   price=47999
 *   id=3  MacBook   price=52999
 *   id=4  Sony      price=12999
 *   id=5  Logitech  price=4299
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';

describe('ProductsController (e2e)', () => {
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

  describe('GET /products', () => {
    it('should return an array of seeded products', async () => {
      const res = await request(app.getHttpServer()).get('/products').query({ limit: 100 });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(5);

      // Verify known seeded product fields
      const iphone = res.body.find((p: any) => p.name === 'iPhone 15 Pro');
      expect(iphone).toBeDefined();
      expect(iphone).toHaveProperty('id');
      expect(iphone).toHaveProperty('slug');
      expect(iphone).toHaveProperty('price');
    });

    it('should support search query parameter', async () => {
      const res = await request(app.getHttpServer()).get('/products').query({ search: 'MacBook' });

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].name).toContain('MacBook');
    });
  });

  describe('GET /products/:id', () => {
    it('should return a single product by id', async () => {
      // Fetch all products first to get a valid id
      const allRes = await request(app.getHttpServer()).get('/products');
      const product = allRes.body[0];

      const res = await request(app.getHttpServer()).get(`/products/${product.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', product.id);
      expect(res.body).toHaveProperty('name');
      expect(res.body).toHaveProperty('slug');
      expect(res.body).toHaveProperty('price');
      expect(res.body).toHaveProperty('createdAt');
    });

    it('should return 404 for non-existent product', async () => {
      const res = await request(app.getHttpServer()).get('/products/999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('message');
    });
  });

  describe('POST /products', () => {
    it('should create a new product and return 201', async () => {
      const dto = {
        name: 'E2E Test Product',
        slug: `e2e-test-product-${Date.now()}`,
        brand: 'TestBrand',
        price: 9999,
        visible: true,
        published: true,
      };

      const res = await request(app.getHttpServer()).post('/products').send(dto);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(dto.name);
      expect(res.body.slug).toBe(dto.slug);
      expect(res.body.brand).toBe(dto.brand);
      expect(Number(res.body.price)).toBe(dto.price);
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer()).post('/products').send({ brand: 'NoBrand' });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /products/:id', () => {
    it('should update an existing product', async () => {
      // Create a product to update
      const createRes = await request(app.getHttpServer())
        .post('/products')
        .send({
          name: 'Update Target',
          slug: `update-target-${Date.now()}`,
          price: 1000,
        });
      const productId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/products/${productId}`)
        .send({ name: 'Updated Product Name', price: 2000 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Product Name');
      expect(Number(res.body.price)).toBe(2000);
    });

    it('should return 404 when updating non-existent product', async () => {
      const res = await request(app.getHttpServer()).patch('/products/999').send({ name: 'Ghost' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /products/:id', () => {
    it('should delete a product and return 204', async () => {
      // Create a product to delete
      const createRes = await request(app.getHttpServer())
        .post('/products')
        .send({
          name: 'Delete Target',
          slug: `delete-target-${Date.now()}`,
        });
      const productId = createRes.body.id;

      const res = await request(app.getHttpServer()).delete(`/products/${productId}`);

      expect(res.status).toBe(204);

      // Confirm it's gone
      const getRes = await request(app.getHttpServer()).get(`/products/${productId}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent product', async () => {
      const res = await request(app.getHttpServer()).delete('/products/999');

      expect(res.status).toBe(404);
    });
  });
});

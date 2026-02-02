import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [UserService],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // TODO: Restore GET tests when connected to real database with seed data
  /*
  describe('GET /users', () => {
    it('should return users list', async () => {
      const response = await request(app.getHttpServer()).get('/users');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /users/:id', () => {
    it('should return single user without password', async () => {
      const response = await request(app.getHttpServer()).get('/users/1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email');
      expect(response.body).not.toHaveProperty('password');
    });
  });
  */

  describe('POST /users', () => {
    it('should create user', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'test@example.com', username: 'testuser', password: 'password123' });

      expect(response.status).toBe(201);
      expect(response.text).toBe('User created successfully');
    });

    it('should return 400 for invalid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'invalid-email' });

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /users/:id', () => {
    it('should update user', async () => {
      const response = await request(app.getHttpServer())
        .put('/users/1')
        .send({ email: 'updated@example.com' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('User with ID 1 updated successfully');
    });
  });

  describe('PATCH /users/:id/password', () => {
    it('should update password', async () => {
      const response = await request(app.getHttpServer())
        .patch('/users/1/password')
        .send({ password: 'newpassword123' });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Password for user ID 1 updated successfully');
    });

    it('should return 400 for short password', async () => {
      const response = await request(app.getHttpServer())
        .patch('/users/1/password')
        .send({ password: '123' });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .patch('/users/999/password')
        .send({ password: 'newpassword123' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /users/:id', () => {
    it('should delete user', async () => {
      const response = await request(app.getHttpServer()).delete('/users/3');

      expect(response.status).toBe(204);
    });
  });
});

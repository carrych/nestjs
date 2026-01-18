import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { UserController } from './user.controller';

describe('UserController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /users', () => {
    it('should return users list with default pagination', async () => {
      const response = await request(app.getHttpServer()).get('/users');

      expect(response.status).toBe(200);
      expect(response.text).toBe('Users list (page: 1, limit: 10)');
    });

    it('should return users list with custom pagination', async () => {
      const response = await request(app.getHttpServer()).get('/users?page=2&limit=20');

      expect(response.status).toBe(200);
      expect(response.text).toBe('Users list (page: 2, limit: 20)');
    });
  });

  describe('GET /users/:id', () => {
    it('should return single user', async () => {
      const response = await request(app.getHttpServer()).get('/users/1');

      expect(response.status).toBe(200);
      expect(response.text).toBe('User with ID 1');
    });
  });

  describe('POST /users', () => {
    it('should create user', async () => {
      const response = await request(app.getHttpServer()).post('/users');

      expect(response.status).toBe(201);
      expect(response.text).toBe('User created');
    });
  });

  describe('PUT /users/:id', () => {
    it('should update user', async () => {
      const response = await request(app.getHttpServer()).put('/users/1');

      expect(response.status).toBe(200);
      expect(response.text).toBe('User 1 updated');
    });
  });

  describe('DELETE /users/:id', () => {
    it('should delete user', async () => {
      const response = await request(app.getHttpServer()).delete('/users/1');

      expect(response.status).toBe(200);
      expect(response.text).toBe('User 1 deleted');
    });
  });
});

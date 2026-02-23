import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    email: 'test@example.com',
    passwordHash: 'hashed',
    role: UserRole.USER,
    createdAt: new Date(),
    ...overrides,
  }) as User;

describe('UserController', () => {
  let app: INestApplication;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    })),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  describe('POST /users', () => {
    it('201 — creates user and returns it', async () => {
      const saved = makeUser();
      mockRepo.create.mockReturnValue(saved);
      mockRepo.save.mockResolvedValue(saved);

      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'test@example.com', password: 'Password123!' })
        .expect(201);

      expect(res.body).toMatchObject({ id: 1, email: 'test@example.com', role: 'user' });
    });

    it('400 for invalid email', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'not-an-email', password: 'Password123!' })
        .expect(400);
    });

    it('400 for missing password', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ email: 'test@example.com' })
        .expect(400);
    });
  });

  describe('GET /users/:id', () => {
    it('200 — returns user', async () => {
      mockRepo.findOne.mockResolvedValue(makeUser());
      const res = await request(app.getHttpServer()).get('/users/1').expect(200);
      expect(res.body).toMatchObject({ id: 1, email: 'test@example.com' });
    });

    it('404 for non-existent user', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await request(app.getHttpServer()).get('/users/999').expect(404);
    });
  });

  describe('PATCH /users/:id', () => {
    it('200 — updates user', async () => {
      const updated = makeUser({ email: 'new@example.com' });
      mockRepo.findOne.mockResolvedValue(makeUser());
      mockRepo.save.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch('/users/1')
        .send({ email: 'new@example.com' })
        .expect(200);

      expect(res.body).toMatchObject({ email: 'new@example.com' });
    });

    it('404 for non-existent user', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await request(app.getHttpServer())
        .patch('/users/999')
        .send({ email: 'new@example.com' })
        .expect(404);
    });
  });

  describe('PATCH /users/:id/password', () => {
    it('204 — updates password', async () => {
      mockRepo.findOne.mockResolvedValue(makeUser());
      mockRepo.update.mockResolvedValue({ affected: 1 });

      await request(app.getHttpServer())
        .patch('/users/1/password')
        .send({ password: 'NewPassword123!' })
        .expect(204);
    });

    it('404 for non-existent user', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await request(app.getHttpServer())
        .patch('/users/999/password')
        .send({ password: 'NewPassword123!' })
        .expect(404);
    });
  });

  describe('DELETE /users/:id', () => {
    it('204 — deletes user', async () => {
      mockRepo.findOne.mockResolvedValue(makeUser());
      mockRepo.remove.mockResolvedValue(undefined);

      await request(app.getHttpServer()).delete('/users/1').expect(204);
    });

    it('404 for non-existent user', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await request(app.getHttpServer()).delete('/users/999').expect(404);
    });
  });
});

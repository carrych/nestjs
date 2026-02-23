import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { UserService } from '../user.service';
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    email: 'user@example.com',
    passwordHash: 'hash',
    role: UserRole.USER,
    tokenVersion: 1,
    createdAt: new Date(),
    ...overrides,
  }) as User;

describe('UserService — admin methods', () => {
  let service: UserService;

  const mockRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    increment: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();

    service = module.get(UserService);
  });

  // ─── setRole() ────────────────────────────────────────────────────────────

  describe('setRole()', () => {
    it('updates role and returns saved user', async () => {
      const user = makeUser({ role: UserRole.USER });
      mockRepo.findOne.mockResolvedValue(user);
      mockRepo.save.mockResolvedValue({ ...user, role: UserRole.ADMIN });

      const result = await service.setRole(1, UserRole.ADMIN);

      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ role: UserRole.ADMIN }));
      expect(result.role).toBe(UserRole.ADMIN);
    });

    it('throws 404 when user not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.setRole(999, UserRole.ADMIN)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── revokeAllSessions() ──────────────────────────────────────────────────

  describe('revokeAllSessions()', () => {
    it('increments tokenVersion for the user', async () => {
      mockRepo.increment.mockResolvedValue({ affected: 1 });

      await service.revokeAllSessions(1);

      expect(mockRepo.increment).toHaveBeenCalledWith({ id: 1 }, 'tokenVersion', 1);
    });

    it('throws 404 when user not found', async () => {
      mockRepo.increment.mockResolvedValue({ affected: 0 });
      await expect(service.revokeAllSessions(999)).rejects.toThrow(NotFoundException);
    });
  });
});

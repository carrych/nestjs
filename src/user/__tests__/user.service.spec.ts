import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { UserService } from '../user.service';
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

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
  let mockAuditLogsService: { log: jest.Mock; logEvent: jest.Mock };

  const mockQueryBuilder = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    increment: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAuditLogsService = { log: jest.fn(), logEvent: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
      ],
    }).compile();

    service = module.get(UserService);
  });

  // ─── findByEmail() ────────────────────────────────────────────────────────

  describe('findByEmail()', () => {
    it('returns user with passwordHash when found', async () => {
      const user = makeUser();
      mockQueryBuilder.getOne.mockResolvedValue(user);

      const result = await service.findByEmail('user@example.com');

      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith('user.passwordHash');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user.email = :email', {
        email: 'user@example.com',
      });
      expect(result).toEqual(user);
    });

    it('returns null when user not found', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      const result = await service.findByEmail('unknown@example.com');

      expect(result).toBeNull();
    });
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

    it('logs user.role_changed with previousRole and newRole in details', async () => {
      const user = makeUser({ role: UserRole.USER });
      mockRepo.findOne.mockResolvedValue(user);
      mockRepo.save.mockResolvedValue({ ...user, role: UserRole.ADMIN });

      await service.setRole(1, UserRole.ADMIN);

      expect(mockAuditLogsService.logEvent).toHaveBeenCalledWith(
        'user.role_changed',
        expect.objectContaining({
          details: expect.objectContaining({
            previousRole: UserRole.USER,
            newRole: UserRole.ADMIN,
          }),
        }),
      );
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

    it('logs user.sessions_revoked with targetUserId', async () => {
      mockRepo.increment.mockResolvedValue({ affected: 1 });

      await service.revokeAllSessions(42);

      expect(mockAuditLogsService.logEvent).toHaveBeenCalledWith(
        'user.sessions_revoked',
        expect.objectContaining({
          entityId: '42',
        }),
      );
    });
  });
});

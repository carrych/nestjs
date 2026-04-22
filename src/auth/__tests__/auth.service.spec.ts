import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';

jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));
import * as bcrypt from 'bcrypt';

import { AuthService } from '../auth.service';
import { TokenBlacklist } from '../entities/token-blacklist.entity';
import { UserService } from '../../user/user.service';
import { UserRole } from '../../user/enums/user-role.enum';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuditOutcome } from '../../audit-logs/entities/audit-log.entity';

const MOCK_USER = {
  id: 1,
  email: 'user@example.com',
  passwordHash: 'hashed',
  role: UserRole.USER,
  tokenVersion: 1,
};

const futureDate = new Date(Date.now() + 3_600_000); // +1 h
const pastDate = new Date(Date.now() - 1_000); // -1 s

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<Pick<UserService, 'findByEmail'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;
  let blacklistRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let mockAuditLogsService: { log: jest.Mock; logEvent: jest.Mock };

  beforeEach(async () => {
    userService = { findByEmail: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('signed.token') };
    blacklistRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(),
      delete: jest.fn(),
    };
    mockAuditLogsService = { log: jest.fn(), logEvent: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: jwtService },
        { provide: getRepositoryToken(TokenBlacklist), useValue: blacklistRepo },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ─── login() ──────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('returns accessToken on valid credentials', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      userService.findByEmail.mockResolvedValue(MOCK_USER as never);

      const result = await service.login('user@example.com', 'password');
      expect(result).toEqual({ accessToken: 'signed.token' });
    });

    it('includes jti (UUID) and tokenVersion in JWT payload', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      userService.findByEmail.mockResolvedValue(MOCK_USER as never);

      await service.login('user@example.com', 'password');

      const payload = jwtService.sign.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).toHaveProperty('jti');
      expect(typeof payload['jti']).toBe('string');
      expect(payload['jti']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(payload).toHaveProperty('tokenVersion', 1);
    });

    it('throws 401 when user not found', async () => {
      userService.findByEmail.mockResolvedValue(null);
      await expect(service.login('x@x.com', 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('throws 401 on wrong password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      userService.findByEmail.mockResolvedValue(MOCK_USER as never);
      await expect(service.login('user@example.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    // ─── Audit logging on failure ────────────────────────────────────────────

    it('logs auth.login_failed with outcome FAILURE when user is not found', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(service.login('x@x.com', 'pw')).rejects.toThrow(UnauthorizedException);

      expect(mockAuditLogsService.logEvent).toHaveBeenCalledWith(
        'auth.login_failed',
        expect.objectContaining({ outcome: AuditOutcome.FAILURE }),
      );
    });

    it('logs auth.login_failed with outcome FAILURE and entityId when password is wrong', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      userService.findByEmail.mockResolvedValue(MOCK_USER as never);

      await expect(service.login('user@example.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockAuditLogsService.logEvent).toHaveBeenCalledWith(
        'auth.login_failed',
        expect.objectContaining({
          outcome: AuditOutcome.FAILURE,
          entityId: String(MOCK_USER.id),
        }),
      );
    });
  });

  // ─── logout() / isBlocked() ───────────────────────────────────────────────

  describe('logout()', () => {
    it('saves entry to blacklist repository', async () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      await service.logout('jti-abc', 1, exp);
      expect(blacklistRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ jti: 'jti-abc', userId: 1 }),
      );
    });
  });

  describe('isBlocked()', () => {
    it('returns false for unknown jti', async () => {
      blacklistRepo.findOne.mockResolvedValue(null);
      expect(await service.isBlocked('unknown')).toBe(false);
    });

    it('returns true for a valid (non-expired) blacklist entry', async () => {
      blacklistRepo.findOne.mockResolvedValue({ jti: 'jti-1', expiresAt: futureDate });
      expect(await service.isBlocked('jti-1')).toBe(true);
    });

    it('returns false when blacklist entry has already expired', async () => {
      blacklistRepo.findOne.mockResolvedValue({ jti: 'jti-old', expiresAt: pastDate });
      expect(await service.isBlocked('jti-old')).toBe(false);
    });
  });

  // ─── pruneExpiredBlacklist() ──────────────────────────────────────────────

  describe('pruneExpiredBlacklist()', () => {
    it('calls repo.delete with LessThan(now) condition', async () => {
      blacklistRepo.delete.mockResolvedValue({ affected: 3 });
      await service.pruneExpiredBlacklist();
      expect(blacklistRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: expect.anything() }),
      );
    });
  });
});

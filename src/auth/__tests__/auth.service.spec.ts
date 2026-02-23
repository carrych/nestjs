import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

jest.mock('bcrypt', () => ({ compare: jest.fn() }));
import * as bcrypt from 'bcrypt';

import { AuthService } from '../auth.service';
import { UserService } from '../../user/user.service';
import { UserRole } from '../../user/enums/user-role.enum';

const MOCK_USER = {
  id: 1,
  email: 'user@example.com',
  passwordHash: 'hashed',
  role: UserRole.USER,
};

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<Pick<UserService, 'findByEmail'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;

  beforeEach(async () => {
    userService = { findByEmail: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('signed.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: jwtService },
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

    it('includes jti in JWT payload', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      userService.findByEmail.mockResolvedValue(MOCK_USER as never);

      await service.login('user@example.com', 'password');

      const payload = jwtService.sign.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).toHaveProperty('jti');
      expect(typeof payload['jti']).toBe('string');
      expect(payload['jti']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
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
  });

  // ─── logout() / isBlocked() ───────────────────────────────────────────────

  describe('logout() + isBlocked()', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const pastExp = Math.floor(Date.now() / 1000) - 1;     // 1 second ago

    it('isBlocked() returns false for unknown jti', () => {
      expect(service.isBlocked('unknown-jti')).toBe(false);
    });

    it('isBlocked() returns true after logout()', () => {
      service.logout('jti-abc', futureExp);
      expect(service.isBlocked('jti-abc')).toBe(true);
    });

    it('isBlocked() returns false after token has already expired', () => {
      service.logout('jti-expired', pastExp);
      expect(service.isBlocked('jti-expired')).toBe(false);
    });

    it('different JTIs are blocked independently', () => {
      service.logout('jti-1', futureExp);
      expect(service.isBlocked('jti-1')).toBe(true);
      expect(service.isBlocked('jti-2')).toBe(false);
    });
  });
});

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

import { UserService } from '../user/user.service';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { JwtPayload } from './strategies/jwt.strategy';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditOutcome } from '../audit-logs/entities/audit-log.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    @InjectRepository(TokenBlacklist)
    private readonly blacklistRepo: Repository<TokenBlacklist>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async login(
    email: string,
    password: string,
    context?: { ip?: string; correlationId?: string; userAgent?: string },
  ): Promise<{ accessToken: string }> {
    const user = await this.userService.findByEmail(email);

    if (!user) {
      // Log failed attempt without revealing that the user doesn't exist
      this.auditLogsService.logEvent('auth.login_failed', {
        userId: null,
        role: null,
        outcome: AuditOutcome.FAILURE,
        details: { reason: 'user_not_found' },
        ip: context?.ip ?? null,
        correlationId: context?.correlationId ?? null,
        userAgent: context?.userAgent ?? null,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      this.auditLogsService.logEvent('auth.login_failed', {
        userId: user.id,
        role: user.role,
        outcome: AuditOutcome.FAILURE,
        entityType: 'user',
        entityId: String(user.id),
        details: { reason: 'invalid_password' },
        ip: context?.ip ?? null,
        correlationId: context?.correlationId ?? null,
        userAgent: context?.userAgent ?? null,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      jti: randomUUID(),
      tokenVersion: user.tokenVersion,
    };
    return { accessToken: this.jwtService.sign(payload) };
  }

  /**
   * Invalidate a single token by JTI (used on logout).
   * The entry is auto-pruned by the cleanup cron when it expires.
   */
  async logout(jti: string, userId: number, exp: number): Promise<void> {
    const entry = this.blacklistRepo.create({
      jti,
      userId,
      expiresAt: new Date(exp * 1000),
    });
    await this.blacklistRepo.save(entry);

    this.auditLogsService.logEvent('auth.token_blacklisted', {
      userId,
      entityType: 'user',
      entityId: String(userId),
      details: { jti },
    });
  }

  async isBlocked(jti: string): Promise<boolean> {
    const entry = await this.blacklistRepo.findOne({ where: { jti } });
    if (!entry) return false;
    if (entry.expiresAt < new Date()) return false;
    return true;
  }

  /** Called by cleanup cron — removes all expired blacklist entries. */
  async pruneExpiredBlacklist(): Promise<void> {
    await this.blacklistRepo.delete({ expiresAt: LessThan(new Date()) });
  }
}

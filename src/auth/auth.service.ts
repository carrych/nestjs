import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

import { UserService } from '../user/user.service';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    @InjectRepository(TokenBlacklist)
    private readonly blacklistRepo: Repository<TokenBlacklist>,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

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
  }

  async isBlocked(jti: string): Promise<boolean> {
    const entry = await this.blacklistRepo.findOne({ where: { jti } });
    if (!entry) return false;
    // Treat already-expired entries as not-blocked (cron will clean them up)
    if (entry.expiresAt < new Date()) return false;
    return true;
  }

  /** Called by cleanup cron — removes all expired blacklist entries. */
  async pruneExpiredBlacklist(): Promise<void> {
    await this.blacklistRepo.delete({ expiresAt: LessThan(new Date()) });
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

import { UserService } from '../user/user.service';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  /** jti → expiry timestamp (ms). Pruned opportunistically on each logout. */
  private readonly blocklist = new Map<string, number>();

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload: JwtPayload = { sub: user.id, email: user.email, jti: randomUUID() };
    return { accessToken: this.jwtService.sign(payload) };
  }

  /**
   * Invalidate a token by its JTI until it would have expired anyway.
   * @param jti  JWT ID claim from the token
   * @param exp  JWT `exp` claim (Unix seconds); used to auto-expire the entry
   */
  logout(jti: string, exp: number): void {
    this.blocklist.set(jti, exp * 1000);
    this.pruneBlocklist();
  }

  isBlocked(jti: string): boolean {
    const expiresAt = this.blocklist.get(jti);
    if (expiresAt === undefined) return false;
    if (expiresAt < Date.now()) {
      this.blocklist.delete(jti);
      return false;
    }
    return true;
  }

  private pruneBlocklist(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.blocklist) {
      if (expiresAt < now) this.blocklist.delete(key);
    }
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthService } from '../auth.service';
import { UserService } from '../../user/user.service';

export interface JwtPayload {
  sub: number;
  email: string;
  jti: string;
  tokenVersion: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // 1. Individual token revoked (logout)
    if (await this.authService.isBlocked(payload.jti)) throw new UnauthorizedException();

    // 2. All user sessions revoked (password change / admin action)
    const user = await this.userService.findOne(payload.sub);
    if (!user) throw new UnauthorizedException();
    if (user.tokenVersion !== payload.tokenVersion) throw new UnauthorizedException();

    return { ...user, jti: payload.jti, tokenExp: payload.exp };
  }
}

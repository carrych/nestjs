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
    if (this.authService.isBlocked(payload.jti)) throw new UnauthorizedException();
    const user = await this.userService.findOne(payload.sub);
    if (!user) throw new UnauthorizedException();
    return { ...user, jti: payload.jti, tokenExp: payload.exp };
  }
}

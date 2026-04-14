import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

import { SkipAuditLog } from '../common/decorators/skip-audit-log.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { User } from '../user/entities/user.entity';

type RequestWithExtras = Request & { requestId?: string };

@SkipAuditLog()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Strict rate limit: 5 attempts per 60 s per IP.
   * Prevents brute-force password attacks.
   */
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: RequestWithExtras): Promise<{ accessToken: string }> {
    return this.authService.login(dto.email, dto.password, {
      ip: req.ip ?? undefined,
      correlationId: req.requestId,
      userAgent: req.headers['user-agent']?.slice(0, 500),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Req() req: { user: User & { jti: string; tokenExp: number } }): Promise<void> {
    return this.authService.logout(req.user.jti, req.user.id, req.user.tokenExp);
  }
}

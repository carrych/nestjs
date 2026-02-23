import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { SkipAuditLog } from '../common/decorators/skip-audit-log.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@SkipAuditLog()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<{ accessToken: string }> {
    return this.authService.login(dto.email, dto.password);
  }
}

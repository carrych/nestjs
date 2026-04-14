import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenBlacklist } from './entities/token-blacklist.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenBlacklistCleanupTask } from './tasks/token-blacklist-cleanup.task';

@Module({
  imports: [
    UserModule,
    PassportModule,
    TypeOrmModule.forFeature([TokenBlacklist]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>(
            'JWT_EXPIRES_IN',
            '15m',
          ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenBlacklistCleanupTask],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

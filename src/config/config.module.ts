import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { Config } from './config';

export const APP_CONFIG = Symbol('APP_CONFIG');

function validate(config: Record<string, unknown>): Config {
  const mapped = {
    postgres: {
      connection: config.POSTGRES_CONNECTION,
      pool: {
        min: Number(config.POSTGRES_POOL_MIN),
        max: Number(config.POSTGRES_POOL_MAX),
      },
    },
  };

  const validated = plainToInstance(Config, mapped);
  const errors = validateSync(validated, { whitelist: true });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validated;
}

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      validate,
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (configService: ConfigService<Config, true>) => ({
        postgres: configService.get('postgres', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}

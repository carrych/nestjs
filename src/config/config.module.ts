import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { Config } from './config';

export const APP_CONFIG = Symbol('APP_CONFIG');

function validate(config: Record<string, unknown>): Config {
  const mapped = {
    database: {
      host: config.DB_HOST,
      port: Number(config.DB_PORT),
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      name: config.DB_NAME,
    },
  };

  const validated = plainToInstance(Config, mapped);
  const errors = validateSync(validated, { whitelist: true });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  // Merge raw env vars back so raw-key lookups (JWT_SECRET, RABBITMQ_URL, AWS_*)
  // continue to work alongside the typed `database` nested object
  return { ...config, ...validated } as unknown as Config;
}

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (configService: ConfigService<Config, true>) => ({
        database: configService.get('database', { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}

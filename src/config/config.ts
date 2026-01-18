import { Type } from 'class-transformer';
import { IsNumber, IsString, ValidateNested } from 'class-validator';

class PoolConfig {
  @IsNumber()
  min: number;

  @IsNumber()
  max: number;
}

class PostgresConfig {
  @IsString()
  connection: string;

  @ValidateNested()
  @Type(() => PoolConfig)
  pool: PoolConfig;
}

export class Config {
  @ValidateNested()
  @Type(() => PostgresConfig)
  postgres: PostgresConfig;
}

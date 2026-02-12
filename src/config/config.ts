import { Type } from 'class-transformer';
import { IsNumber, IsString, ValidateNested } from 'class-validator';

class DatabaseConfig {
  @IsString()
  host: string;

  @IsNumber()
  port: number;

  @IsString()
  user: string;

  @IsString()
  password: string;

  @IsString()
  name: string;
}

export class Config {
  @ValidateNested()
  @Type(() => DatabaseConfig)
  database: DatabaseConfig;
}

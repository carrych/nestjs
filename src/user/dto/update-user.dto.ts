import { IsEmail, IsObject, IsOptional, IsString } from 'class-validator';

import type { UserMetadata } from '../interfaces/user.interface';

export class UpdateUserDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsObject()
  @IsOptional()
  metadata?: UserMetadata;
}

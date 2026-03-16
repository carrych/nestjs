import { IsEnum } from 'class-validator';

import { UserRole } from '../enums/user-role.enum';

export class AssignRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

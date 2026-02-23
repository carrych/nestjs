import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

import { UserRole } from '../../../user/enums/user-role.enum';

registerEnumType(UserRole, { name: 'UserRole' });

@ObjectType()
export class UserType {
  @Field(() => Int)
  id: number;

  @Field()
  email: string;

  @Field(() => UserRole)
  role: UserRole;
}

import { Module } from '@nestjs/common';
import { UserModule } from '../../user/user.module';
import { UsersResolver } from './resolvers/users.resolver';

@Module({
  imports: [UserModule],
  providers: [UsersResolver],
})
export class GraphqlUsersModule {}

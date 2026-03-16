import { Args, Int, Query, Resolver } from '@nestjs/graphql';

import { UserService } from '../../../user/user.service';
import { UserType } from '../types/user.type';

@Resolver(() => UserType)
export class UsersResolver {
  constructor(private readonly userService: UserService) {}

  @Query(() => [UserType], { name: 'users' })
  getUsers(
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('limit', { type: () => Int, defaultValue: 10 }) limit: number,
  ): Promise<UserType[]> {
    return this.userService.findAll(page, Math.min(limit, 50)) as Promise<UserType[]>;
  }

  @Query(() => UserType, { name: 'user' })
  getUser(@Args('id', { type: () => Int }) id: number): Promise<UserType> {
    return this.userService.findOne(id) as Promise<UserType>;
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { UsersResolver } from '../resolvers/users.resolver';
import { UserService } from '../../../user/user.service';

describe('UsersResolver', () => {
  let resolver: UsersResolver;
  let userService: { findAll: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    userService = { findAll: jest.fn(), findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersResolver,
        { provide: UserService, useValue: userService },
      ],
    }).compile();

    resolver = module.get<UsersResolver>(UsersResolver);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return users list', () => {
    const users = [{ id: 1, email: 'a@b.com', username: 'alice' }];
    userService.findAll.mockReturnValue(users);

    const result = resolver.getUsers(1, 10);

    expect(userService.findAll).toHaveBeenCalledWith(1, 10);
    expect(result).toEqual(users);
  });

  it('should cap limit at 50', () => {
    userService.findAll.mockReturnValue([]);

    resolver.getUsers(1, 100);

    expect(userService.findAll).toHaveBeenCalledWith(1, 50);
  });

  it('should return single user', () => {
    const user = { id: 2, email: 'b@c.com', username: 'bob' };
    userService.findOne.mockReturnValue(user);

    const result = resolver.getUser(2);

    expect(userService.findOne).toHaveBeenCalledWith(2);
    expect(result).toEqual(user);
  });
});

import { Injectable, NotFoundException } from '@nestjs/common';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserWithoutPassword } from './interfaces/user.interface';

@Injectable()
export class UserService {
  private users: User[] = [
    {
      id: 1,
      email: 'john@example.com',
      username: 'john_doe',
      password: 'hashed_password_1',
      metadata: { role: 'admin', verified: true },
    },
    {
      id: 2,
      email: 'jane@example.com',
      username: 'jane_smith',
      password: 'hashed_password_2',
      metadata: { role: 'user', verified: true, preferences: { theme: 'dark' } },
    },
    {
      id: 3,
      email: 'bob@example.com',
      username: 'bob_wilson',
      password: 'hashed_password_3',
      metadata: { role: 'user', verified: false },
    },
  ];

  private nextId = 4;

  findAll(page: number, limit: number): UserWithoutPassword[] {
    const start = (page - 1) * limit;
    return this.users.slice(start, start + limit).map(this.excludePassword);
  }

  findOne(id: number): UserWithoutPassword {
    const user = this.users.find((u) => u.id === id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return this.excludePassword(user);
  }
  // TODO: Implement user creation, updating, password hashing, and deletion methods when postgres will be used.
  create(createUserDto: CreateUserDto): string {
    // TODO: Hash password with argon2
    // const hashedPassword = await argon2.hash(createUserDto.password);

    return `User created successfully`;
  }

  update(id: number, updateUserDto: UpdateUserDto): string {
    return `User with ID ${id} updated successfully`;
  }

  updatePassword(id: number, password: string): string {
    const userIndex = this.users.findIndex((u) => u.id === id);
    if (userIndex === -1) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // TODO: Hash password with argon2
    // const hashedPassword = await argon2.hash(password);

    return `Password for user ID ${id} updated successfully`;
  }

  remove(id: number): string {
    return `User with ID ${id} deleted successfully`;
  }

  private excludePassword(user: User): UserWithoutPassword {
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}

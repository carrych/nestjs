import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(page: number, limit: number): Promise<User[]> {
    const take = Math.max(1, Math.min(limit, 100));
    const skip = (page - 1) * take;
    return this.userRepository.find({ skip, take, order: { id: 'ASC' } });
  }

  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password_hash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async create(dto: CreateUserDto): Promise<User> {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      role: UserRole.USER,
    });
    return this.userRepository.save(user);
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, dto);
    return this.userRepository.save(user);
  }

  async updatePassword(id: number, password: string): Promise<void> {
    await this.findOne(id);
    const passwordHash = await bcrypt.hash(password, 12);
    await this.userRepository.update(id, { passwordHash });
  }

  async remove(id: number): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }
}

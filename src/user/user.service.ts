import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditLogsService: AuditLogsService,
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
      .addSelect('user.passwordHash')
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
    const saved = await this.userRepository.save(user);
    return this.findOne(saved.id);
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

  async setRole(
    id: number,
    role: UserRole,
    context?: { actorId?: number; actorRole?: string; correlationId?: string; ip?: string },
  ): Promise<User> {
    const user = await this.findOne(id);
    const previousRole = user.role;
    user.role = role;
    const saved = await this.userRepository.save(user);

    this.auditLogsService.logEvent('user.role_changed', {
      userId: context?.actorId ?? null,
      role: context?.actorRole ?? null,
      entityType: 'user',
      entityId: String(id),
      correlationId: context?.correlationId ?? null,
      ip: context?.ip ?? null,
      details: { targetUserId: id, previousRole, newRole: role },
    });

    return saved;
  }

  /**
   * Increment tokenVersion — invalidates ALL active tokens for this user.
   * The user must log in again to get a new token with the updated version.
   */
  async revokeAllSessions(
    id: number,
    context?: { actorId?: number; actorRole?: string; correlationId?: string; ip?: string },
  ): Promise<void> {
    const result = await this.userRepository.increment({ id }, 'tokenVersion', 1);
    if (!result.affected) throw new NotFoundException(`User #${id} not found`);

    this.auditLogsService.logEvent('user.sessions_revoked', {
      userId: context?.actorId ?? null,
      role: context?.actorRole ?? null,
      entityType: 'user',
      entityId: String(id),
      correlationId: context?.correlationId ?? null,
      ip: context?.ip ?? null,
      details: { targetUserId: id, reason: 'admin_revoke' },
    });
  }
}

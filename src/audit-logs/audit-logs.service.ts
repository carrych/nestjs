import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';

import { AuditLog } from './entities/audit-log.entity';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

export interface CreateAuditLogDto {
  userId?: number | null;
  role?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  log(data: CreateAuditLogDto): void {
    this.repo
      .save(this.repo.create(data))
      .catch((err: Error) => this.logger.error('Failed to save audit log', err.stack));
  }

  async findAll(query: QueryAuditLogDto): Promise<{ data: AuditLog[]; total: number }> {
    const { limit = 20, offset = 0, userId, action, entityType, dateFrom, dateTo } = query;
    const take = Math.max(1, Math.min(limit, 100));

    const where: FindOptionsWhere<AuditLog> = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (dateFrom) where.createdAt = MoreThanOrEqual(new Date(dateFrom));
    if (dateTo) where.createdAt = LessThanOrEqual(new Date(dateTo));

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: offset,
      take,
    });

    return { data, total };
  }
}

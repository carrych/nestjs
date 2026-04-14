import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';

import { AuditLog, AuditOutcome } from './entities/audit-log.entity';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

export interface CreateAuditLogDto {
  userId?: number | null;
  role?: string | null;
  action: string;
  /** Structured event taxonomy (e.g. 'auth.login_failed', 'user.role_changed') */
  eventType?: string | null;
  outcome?: AuditOutcome;
  correlationId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** MUST be sanitized before passing (no passwords, tokens, secrets) */
  details?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /** Fire-and-forget: saves audit record without blocking the caller. */
  log(data: CreateAuditLogDto): void {
    this.repo
      .save(
        this.repo.create({
          ...data,
          outcome: data.outcome ?? AuditOutcome.SUCCESS,
        }),
      )
      .catch((err: Error) => this.logger.error('Failed to save audit log', err.stack));
  }

  /**
   * Structured event log — use this for named security events.
   * Example: logEvent('auth.login_failed', { userId: null, outcome: FAILURE, ... })
   */
  logEvent(
    eventType: string,
    data: Omit<CreateAuditLogDto, 'eventType' | 'action'> & { action?: string },
  ): void {
    this.log({
      ...data,
      eventType,
      action: data.action ?? eventType.replace('.', '_').toUpperCase(),
    });
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

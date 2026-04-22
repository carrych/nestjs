import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AuditOutcome {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

@Entity('audit_logs')
@Index('idx_audit_logs_user_id', ['userId'])
@Index('idx_audit_logs_entity', ['entityType', 'entityId'])
@Index('idx_audit_logs_event_type', ['eventType'])
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  role: string | null;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  /**
   * Structured event taxonomy: auth.login_failed, user.role_changed,
   * user.sessions_revoked, order.status_overridden, etc.
   * Null for generic HTTP mutation logs.
   */
  @Column({ name: 'event_type', type: 'varchar', length: 100, nullable: true })
  eventType: string | null;

  /**
   * Outcome of the action. SUCCESS for completed operations,
   * FAILURE for rejected/error cases.
   */
  @Column({
    type: 'varchar',
    length: 20,
    default: AuditOutcome.SUCCESS,
  })
  outcome: AuditOutcome;

  /**
   * Links this audit event to a specific HTTP request.
   * Matches the X-Request-ID response header so logs can be correlated.
   */
  @Column({ name: 'correlation_id', type: 'varchar', length: 36, nullable: true })
  correlationId: string | null;

  @Column({ name: 'entity_type', type: 'varchar', length: 60, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'varchar', length: 255, nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

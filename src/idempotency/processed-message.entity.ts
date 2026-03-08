import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('processed_messages')
@Index('UQ_processed_messages_message_id', ['messageId'], { unique: true })
@Index('UQ_processed_messages_idempotency_key', ['idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
export class ProcessedMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, name: 'scope' })
  scope: string;

  @Column({ type: 'varchar', length: 200, name: 'message_id' })
  messageId: string;

  @Column({ type: 'varchar', length: 200, name: 'idempotency_key', nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

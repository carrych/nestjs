import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { FileStatus } from '../enums/file-status.enum';
import { FileVisibility } from '../enums/file-visibility.enum';

@Entity('files')
@Index('IDX_files_owner_id', ['ownerId'])
@Index('IDX_files_status', ['status'])
export class FileRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId: number;

  @Column({ name: 'entity_type', type: 'varchar', length: 60 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 255 })
  entityId: string;

  @Column({ type: 'varchar', length: 512, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 120 })
  bucket: string;

  @Column({ name: 'content_type', type: 'varchar', length: 120 })
  contentType: string;

  @Column({ type: 'integer', nullable: true })
  size: number | null;

  @Column({
    type: 'enum',
    enum: FileStatus,
    enumName: 'file_status_enum',
    default: FileStatus.PENDING,
  })
  status: FileStatus;

  @Column({
    type: 'enum',
    enum: FileVisibility,
    enumName: 'file_visibility_enum',
    default: FileVisibility.PRIVATE,
  })
  visibility: FileVisibility;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

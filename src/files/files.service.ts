import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';

import { FileRecord } from './entities/file-record.entity';
import { FileStatus } from './enums/file-status.enum';
import { FileKeyService } from './services/file-key.service';
import { StorageService } from './services/storage.service';
import { PresignDto } from './dto/presign.dto';

export interface PresignResult {
  fileId: string;
  key: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  contentType: string;
  expiresInSec: number;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectRepository(FileRecord)
    private readonly fileRepo: Repository<FileRecord>,
    private readonly storageService: StorageService,
    private readonly fileKeyService: FileKeyService,
    private readonly dataSource: DataSource,
  ) {}

  async presign(dto: PresignDto, userId: number): Promise<PresignResult> {
    if (!this.fileKeyService.isAllowedType(dto.contentType)) {
      throw new BadRequestException(`Unsupported content type: ${dto.contentType}`);
    }

    if (dto.entityType === 'product-image') {
      const [product] = await this.dataSource.query(`SELECT id FROM "products" WHERE "id" = $1`, [
        Number(dto.entityId),
      ]);
      if (!product) throw new NotFoundException(`Product #${dto.entityId} not found`);
    }

    const key = this.fileKeyService.forProductImage(Number(dto.entityId), dto.contentType);

    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const file = this.fileRepo.create({
      ownerId: userId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      key,
      bucket: this.storageService.getBucketName(),
      contentType: dto.contentType,
      size: dto.size,
      status: FileStatus.PENDING,
      expiresAt,
    });
    const saved = await this.fileRepo.save(file);

    const uploadUrl = await this.storageService.presignPutUrl(key, dto.contentType, dto.size);

    return {
      fileId: saved.id,
      key: saved.key,
      uploadUrl,
      uploadMethod: 'PUT',
      contentType: saved.contentType,
      expiresInSec: this.storageService.getExpiresIn(),
    };
  }

  async complete(
    fileId: string,
    userId: number,
  ): Promise<{ fileId: string; status: string; viewUrl: string }> {
    const file = await this.findOwnedOrFail(fileId, userId);

    if (file.status === FileStatus.READY) {
      throw new BadRequestException('File upload already completed');
    }

    if (file.expiresAt && file.expiresAt < new Date()) {
      throw new BadRequestException('Upload window expired');
    }

    const exists = await this.storageService.objectExists(file.key);
    if (!exists) {
      throw new BadRequestException('File not found in storage — upload to S3 first');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(FileRecord).update(fileId, {
        status: FileStatus.READY,
        completedAt: new Date(),
        expiresAt: null,
      });

      if (file.entityType === 'product-image') {
        const returning = await manager.query(
          `UPDATE "products" SET "image_file_id" = $1 WHERE "id" = $2 RETURNING id`,
          [fileId, Number(file.entityId)],
        );
        if (!returning.length) {
          throw new NotFoundException(`Product #${file.entityId} not found`);
        }
      }
    });

    return {
      fileId,
      status: FileStatus.READY,
      viewUrl: this.storageService.getViewUrl(file.key),
    };
  }

  async findOwnedOrFail(fileId: string, userId: number): Promise<FileRecord> {
    const file = await this.fileRepo.findOne({ where: { id: fileId } });
    if (!file) throw new NotFoundException(`File #${fileId} not found`);
    if (file.ownerId !== userId) throw new ForbiddenException('Access denied');
    return file;
  }

  async remove(fileId: string, userId: number): Promise<void> {
    const file = await this.findOwnedOrFail(fileId, userId);
    await this.storageService.deleteObject(file.key);
    await this.fileRepo.remove(file);
  }

  async cleanupExpiredPending(): Promise<void> {
    const expired = await this.fileRepo.find({
      where: { status: FileStatus.PENDING, expiresAt: LessThan(new Date()) },
    });

    for (const file of expired) {
      try {
        await this.storageService.deleteObject(file.key);
      } catch (err) {
        this.logger.warn(`Failed to delete S3 object ${file.key}: ${(err as Error).message}`);
      }
      await this.fileRepo.remove(file);
    }

    if (expired.length > 0) {
      this.logger.log(`Cleaned up ${expired.length} expired pending file records`);
    }
  }
}

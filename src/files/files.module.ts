import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FileRecord } from './entities/file-record.entity';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './services/storage.service';
import { FileKeyService } from './services/file-key.service';
import { FileCleanupTask } from './tasks/file-cleanup.task';

@Module({
  imports: [TypeOrmModule.forFeature([FileRecord])],
  controllers: [FilesController],
  providers: [FilesService, StorageService, FileKeyService, FileCleanupTask],
  exports: [FilesService, StorageService],
})
export class FilesModule {}

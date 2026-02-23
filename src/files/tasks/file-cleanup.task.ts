import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { FilesService } from '../files.service';

@Injectable()
export class FileCleanupTask {
  private readonly logger = new Logger(FileCleanupTask.name);

  constructor(private readonly filesService: FilesService) {}

  @Cron('0 * * * *') // every hour at :00
  async cleanupExpiredPending(): Promise<void> {
    this.logger.log('Running expired pending files cleanup...');
    await this.filesService.cleanupExpiredPending();
  }
}

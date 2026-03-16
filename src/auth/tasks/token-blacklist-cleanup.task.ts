import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AuthService } from '../auth.service';

@Injectable()
export class TokenBlacklistCleanupTask {
  private readonly logger = new Logger(TokenBlacklistCleanupTask.name);

  constructor(private readonly authService: AuthService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    await this.authService.pruneExpiredBlacklist();
    this.logger.debug('Pruned expired token blacklist entries');
  }
}

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { OutboxMessage, OutboxStatus } from './outbox-message.entity';

@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  onApplicationBootstrap(): void {
    const enabled = (process.env.WORKERS_ENABLED ?? 'true') !== 'false';
    if (!enabled) {
      this.logger.log('Outbox relay disabled');
      return;
    }

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        this.logger.error('Outbox relay tick failed', (err as Error)?.stack ?? String(err));
      });
    }, 1000);

    this.logger.log('Outbox relay started (intervalMs=1000)');
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(OutboxMessage);

      const messages = await repo
        .createQueryBuilder('m')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('m.status IN (:...statuses)', {
          statuses: [OutboxStatus.PENDING, OutboxStatus.FAILED],
        })
        .andWhere('(m.nextAttemptAt IS NULL OR m.nextAttemptAt <= :now)', { now })
        .orderBy('m.createdAt', 'ASC')
        .limit(50)
        .getMany();

      for (const m of messages) {
        try {
          this.rabbitmqService.publishToQueue('domain.events', {
            id: m.id,
            type: m.type,
            payload: m.payload,
            createdAt: m.createdAt.toISOString(),
          });

          m.status = OutboxStatus.SENT;
          m.nextAttemptAt = null;
          await repo.save(m);
        } catch {
          m.status = OutboxStatus.FAILED;
          m.attempts = (m.attempts ?? 0) + 1;
          m.nextAttemptAt = this.nextAttemptAt(m.attempts);
          await repo.save(m);

          this.logger.warn(`Failed to publish outbox (id=${m.id}, attempts=${m.attempts})`);
        }
      }
    });
  }

  private nextAttemptAt(attempts: number): Date {
    const baseMs = 1000;
    const backoffMs = Math.min(baseMs * Math.pow(2, Math.max(0, attempts - 1)), 60_000);
    return new Date(Date.now() + backoffMs);
  }
}

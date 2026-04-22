import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { OutboxMessage, OutboxStatus } from './outbox-message.entity';

@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly MIN_INTERVAL_MS = 1_000;
  private readonly MAX_INTERVAL_MS = 10_000;
  private currentIntervalMs = this.MIN_INTERVAL_MS;

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

    this.scheduleNext();
    this.logger.log(
      `Outbox relay started (minMs=${this.MIN_INTERVAL_MS}, maxMs=${this.MAX_INTERVAL_MS})`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => {
      this.tick()
        .then((processed) => {
          this.currentIntervalMs =
            processed > 0
              ? this.MIN_INTERVAL_MS
              : Math.min(this.currentIntervalMs * 2, this.MAX_INTERVAL_MS);
        })
        .catch((err) => {
          this.logger.error('Outbox relay tick failed', (err as Error)?.stack ?? String(err));
          this.currentIntervalMs = this.MIN_INTERVAL_MS;
        })
        .finally(() => {
          this.scheduleNext();
        });
    }, this.currentIntervalMs);
  }

  async tick(): Promise<number> {
    const now = new Date();
    let processed = 0;

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

      processed = messages.length;

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

    return processed;
  }

  private nextAttemptAt(attempts: number): Date {
    const baseMs = 1000;
    const backoffMs = Math.min(baseMs * Math.pow(2, Math.max(0, attempts - 1)), 60_000);
    return new Date(Date.now() + backoffMs);
  }
}

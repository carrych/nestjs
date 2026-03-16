import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Channel, ConsumeMessage } from 'amqplib';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { OrdersService } from './orders.service';
import { OrdersProcessMessage } from './orders-queue.types';

@Injectable()
export class OrdersWorkerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrdersWorkerService.name);
  private readonly maxAttempts = 3;
  private readonly retryDelayMs = 1000; // base delay: 1s, doubles per attempt

  constructor(
    private readonly rabbitmqService: RabbitmqService,
    private readonly ordersService: OrdersService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const enabled = (process.env.WORKERS_ENABLED ?? 'true') !== 'false';
    if (!enabled) {
      this.logger.log('Orders worker disabled');
      return;
    }

    await this.rabbitmqService.consume('orders.process', async (msg, ch) => {
      await this.handleMessage(msg, ch);
    });

    this.logger.log('Orders worker subscribed: orders.process');
  }

  private async handleMessage(msg: ConsumeMessage, ch: Channel): Promise<void> {
    let payload: OrdersProcessMessage;
    try {
      payload = JSON.parse(msg.content.toString('utf-8')) as OrdersProcessMessage;
    } catch {
      this.logger.warn('Invalid JSON payload, sending to DLQ');
      this.rabbitmqService.publishToQueue('orders.dlq', { raw: msg.content.toString('base64') });
      ch.ack(msg);
      return;
    }

    const attempt = Number(payload.attempt ?? 1);
    const { messageId, orderId } = payload;

    try {
      await this.ordersService.processFromQueue({ ...payload, attempt });
      this.logger.log(`Orders worker success (messageId=${messageId}, orderId=${orderId}, attempt=${attempt})`);
      ch.ack(msg);
      return;
    } catch (err) {
      this.logger.warn(
        `Orders worker failed (messageId=${messageId}, orderId=${orderId}, attempt=${attempt}): ${(err as Error)?.message}`,
      );
    }

    if (attempt >= this.maxAttempts) {
      this.logger.error(
        `Orders worker DLQ (messageId=${messageId}, orderId=${orderId}, attempt=${attempt})`,
      );
      this.rabbitmqService.publishToQueue('orders.dlq', { ...payload, attempt });
      ch.ack(msg);
      return;
    }

    const delay = this.retryDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s...
    this.logger.log(
      `Orders worker retry (messageId=${messageId}, orderId=${orderId}, attempt=${attempt + 1}, delayMs=${delay})`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    this.rabbitmqService.publishToQueue(
      'orders.process',
      { ...payload, attempt: attempt + 1 },
      { messageId },
    );
    ch.ack(msg);
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Channel, ChannelModel, ConsumeMessage, Options } from 'amqplib';
import * as amqp from 'amqplib';

export type RabbitConsumeHandler = (msg: ConsumeMessage, channel: Channel) => Promise<void>;

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(private readonly configService: ConfigService) {}

  getChannel(): Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }
    return this.channel;
  }

  async onModuleInit(): Promise<void> {
    const url = this.configService.getOrThrow<string>('RABBITMQ_URL');
    const prefetch = Number(this.configService.get<string>('RABBITMQ_PREFETCH') ?? '10');

    const maxAttempts = 10;
    let client: ChannelModel | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        client = await amqp.connect(url);
        break;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        const delay = 1000 * Math.pow(2, attempt - 1);
        this.logger.warn(`RabbitMQ not ready, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    const ch = await client!.createChannel(); // client is set — loop throws if all attempts fail

    this.connection = client;
    this.channel = ch;

    await ch.prefetch(prefetch);
    await this.assertInfrastructure();

    this.logger.log(`RabbitMQ connected (prefetch=${prefetch})`);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
    } finally {
      await this.connection?.close();
    }
  }

  private async assertInfrastructure(): Promise<void> {
    const ch = this.getChannel();
    await ch.assertQueue('orders.process', { durable: true });
    await ch.assertQueue('orders.dlq', { durable: true });
  }

  publishToQueue(queue: string, payload: unknown, options?: Options.Publish): boolean {
    const ch = this.getChannel();
    const body = Buffer.from(JSON.stringify(payload));
    return ch.sendToQueue(queue, body, {
      contentType: 'application/json',
      persistent: true,
      ...options,
    });
  }

  async consume(
    queue: string,
    handler: RabbitConsumeHandler,
    options?: Options.Consume,
  ): Promise<void> {
    const ch = this.getChannel();
    await ch.consume(
      queue,
      async (msg) => {
        if (!msg) return;
        try {
          await handler(msg, ch);
        } catch (err) {
          this.logger.error(
            `Unhandled consumer error (queue=${queue})`,
            (err as Error)?.stack ?? String(err),
          );
          try {
            ch.nack(msg, false, true);
          } catch {}
        }
      },
      { noAck: false, ...options },
    );
  }
}

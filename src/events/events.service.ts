import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Channel, ConsumeMessage } from 'amqplib';

import { RabbitmqService, StatusChangeEvent } from '../rabbitmq/rabbitmq.service';
import { EventsGateway } from './events.gateway';

@Injectable()
export class EventsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly rabbitmqService: RabbitmqService,
    private readonly gateway: EventsGateway,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const enabled = (process.env.WORKERS_ENABLED ?? 'true') !== 'false';
    if (!enabled) {
      this.logger.log('WS consumer disabled (WORKERS_ENABLED=false)');
      return;
    }

    await this.rabbitmqService.consume('ws.notifications', (msg, ch) =>
      this.handleEvent(msg, ch),
    );
    this.logger.log('WS consumer subscribed: ws.notifications');
  }

  private async handleEvent(msg: ConsumeMessage, ch: Channel): Promise<void> {
    const event: StatusChangeEvent = JSON.parse(msg.content.toString('utf-8'));
    const { entity, userId, orderId, status, correlationId, documentUrl, qrCodeDataUrl } = event;

    const wsEventName = this.toWsEventName(entity);
    const payload = {
      correlationId,
      orderId,
      timestamp: new Date().toISOString(),
      data: {
        status,
        ...(documentUrl && { documentUrl }),
        ...(qrCodeDataUrl && { qrCodeDataUrl }),
      },
    };

    this.logger.log(
      `Emitting ${wsEventName} to user:${userId} (orderId=${orderId}, correlationId=${correlationId})`,
    );
    this.gateway.emitToUser(userId, wsEventName, payload);
    ch.ack(msg);
  }

  toWsEventName(entity: StatusChangeEvent['entity']): string {
    if (entity === 'order') return 'order.created';
    if (entity === 'invoice') return 'invoice.ready';
    return `${entity}.updated`;
  }
}

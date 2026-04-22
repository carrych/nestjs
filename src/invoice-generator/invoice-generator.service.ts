import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Channel, ConsumeMessage } from 'amqplib';

import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { StorageService } from '../files/services/storage.service';
import { InvoicePdfService } from './services/invoice-pdf.service';
import { InvoiceQrService } from './services/invoice-qr.service';
import { InvoiceMessage } from './dto/invoice-message.dto';

@Injectable()
export class InvoiceGeneratorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InvoiceGeneratorService.name);

  constructor(
    private readonly rabbitmqService: RabbitmqService,
    private readonly storageService: StorageService,
    private readonly invoicePdfService: InvoicePdfService,
    private readonly invoiceQrService: InvoiceQrService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if ((process.env.WORKERS_ENABLED ?? 'true') === 'false') {
      this.logger.log('InvoiceGeneratorService: worker disabled');
      return;
    }
    await this.rabbitmqService.consume('invoices_queue', (msg, ch) =>
      this.handleMessage(msg, ch),
    );
    this.logger.log('InvoiceGeneratorService: subscribed to invoices_queue');
  }

  private async handleMessage(msg: ConsumeMessage, ch: Channel): Promise<void> {
    let invoice: InvoiceMessage;
    try {
      invoice = JSON.parse(msg.content.toString('utf-8')) as InvoiceMessage;
    } catch {
      this.logger.warn('InvoiceGeneratorService: invalid JSON message, discarding');
      ch.ack(msg);
      return;
    }

    const pdfBuffer = await this.invoicePdfService.generate(invoice);

    const key = `invoices/${invoice.orderId}/${randomUUID()}.pdf`;
    await this.storageService.putObject(key, pdfBuffer, 'application/pdf');
    const documentUrl = this.storageService.getViewUrl(key);

    const qrCodeDataUrl = await this.invoiceQrService.generateDataUrl(documentUrl);

    this.rabbitmqService.publishStatusChange({
      entity: 'invoice',
      entityId: invoice.orderId,
      orderId: invoice.orderId,
      userId: invoice.userId,
      status: 'ready',
      updatedAt: new Date().toISOString(),
      correlationId: invoice.correlationId,
      documentUrl,
      qrCodeDataUrl,
    });

    ch.ack(msg);
    this.logger.log(
      `InvoiceGeneratorService: invoice.ready orderId=${invoice.orderId} url=${documentUrl}`,
    );
  }
}

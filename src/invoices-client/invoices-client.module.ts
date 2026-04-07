import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

export const INVOICE_SERVICE = 'INVOICE_SERVICE';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: INVOICE_SERVICE,
        useFactory: () => ({
          transport: Transport.RMQ,
          options: {
            urls: [process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'],
            queue: 'invoices_queue',
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class InvoicesClientModule {}

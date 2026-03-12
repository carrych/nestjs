import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Stock } from '../stocks/entities/stock.entity';
import { ProcessedMessage } from '../idempotency/processed-message.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersWorkerService } from './orders-worker.service';
import { OutboxModule } from '../outbox/outbox.module';

export const PAYMENTS_GRPC_CLIENT = 'PAYMENTS_GRPC_CLIENT';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Stock, ProcessedMessage]),
    OutboxModule,
    ClientsModule.register([
      {
        name: PAYMENTS_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: 'payments',
          protoPath: join(process.cwd(), 'proto', 'payments.proto'),
          url: process.env.PAYMENTS_GRPC_URL ?? 'localhost:50051',
        },
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersWorkerService],
  exports: [OrdersService],
})
export class OrdersModule {}

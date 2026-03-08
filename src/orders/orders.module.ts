import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Stock } from '../stocks/entities/stock.entity';
import { ProcessedMessage } from '../idempotency/processed-message.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersWorkerService } from './orders-worker.service';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Stock, ProcessedMessage]), OutboxModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersWorkerService],
  exports: [OrdersService],
})
export class OrdersModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsGrpcClientModule } from '../payments-grpc-client/payments-grpc-client.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Order]), PaymentsGrpcClientModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}

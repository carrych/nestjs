import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentsGrpcController } from './payments-grpc.controller';
import { PaymentsGrpcService } from './payments-grpc.service';
import { Payment } from '../payments/entities/payment.entity';
import { Order } from '../orders/entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [Payment, Order],
        synchronize: false,
      }),
    }),
    TypeOrmModule.forFeature([Payment, Order]),
  ],
  controllers: [PaymentsGrpcController],
  providers: [PaymentsGrpcService],
})
export class PaymentsGrpcModule {}

import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

export const PAYMENTS_GRPC_CLIENT = 'PAYMENTS_GRPC_CLIENT';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: PAYMENTS_GRPC_CLIENT,
        useFactory: () => ({
          transport: Transport.GRPC,
          options: {
            package: 'payments',
            protoPath: join(process.cwd(), 'proto', 'payments.proto'),
            url: process.env.PAYMENTS_GRPC_URL ?? 'payments-grpc:50051',
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class PaymentsGrpcClientModule {}

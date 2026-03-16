import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

import { PaymentsGrpcModule } from './payments-grpc.module';

async function bootstrap() {
  const port = process.env.PAYMENTS_GRPC_PORT ?? '50051';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(PaymentsGrpcModule, {
    transport: Transport.GRPC,
    options: {
      package: 'payments',
      // proto is loaded from project root — always run from the repo root directory
      protoPath: join(process.cwd(), 'proto', 'payments.proto'),
      url: `0.0.0.0:${port}`,
    },
  });

  await app.listen();
  Logger.log(`Payments gRPC server listening on :${port}`, 'PaymentsGrpc');
}

bootstrap();

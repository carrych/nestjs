import { Module } from '@nestjs/common';

import { PaymentsGrpcController } from './payments-grpc.controller';
import { PaymentsGrpcService } from './payments-grpc.service';

@Module({
  controllers: [PaymentsGrpcController],
  providers: [PaymentsGrpcService],
})
export class PaymentsGrpcModule {}

import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';

import { PaymentsGrpcService } from './payments-grpc.service';

interface AuthorizeRequest {
  orderId: number;
  amount: string;
  currency: string;
  idempotencyKey?: string;
}

interface AuthorizeResponse {
  paymentId: string;
  status: string;
}

interface GetPaymentStatusRequest {
  paymentId: string;
}

interface GetPaymentStatusResponse {
  paymentId: string;
  status: string;
}

@Controller()
export class PaymentsGrpcController {
  private readonly logger = new Logger(PaymentsGrpcController.name);

  constructor(private readonly service: PaymentsGrpcService) {}

  @GrpcMethod('Payments', 'Authorize')
  async authorize(req: AuthorizeRequest): Promise<AuthorizeResponse> {
    this.logger.log(`Authorize (orderId=${req.orderId}, amount=${req.amount} ${req.currency})`);
    const record = await this.service.authorize(
      req.orderId,
      req.amount,
      req.currency,
      req.idempotencyKey,
    );
    return { paymentId: record.paymentId, status: record.status };
  }

  @GrpcMethod('Payments', 'GetPaymentStatus')
  async getPaymentStatus(req: GetPaymentStatusRequest): Promise<GetPaymentStatusResponse> {
    const record = await this.service.getStatus(req.paymentId);
    if (!record) {
      throw new RpcException({
        code: GrpcStatus.NOT_FOUND,
        message: `Payment ${req.paymentId} not found`,
      });
    }
    return { paymentId: record.paymentId, status: record.status };
  }

  @GrpcMethod('Payments', 'Capture')
  async capture(req: { paymentId: string }): Promise<{ paymentId: string; status: string }> {
    this.logger.log(`Capture (paymentId=${req.paymentId})`);
    const record = await this.service.capture(req.paymentId);
    if (!record) {
      throw new RpcException({
        code: GrpcStatus.NOT_FOUND,
        message: `Payment ${req.paymentId} not found`,
      });
    }
    return { paymentId: record.paymentId, status: record.status };
  }

  @GrpcMethod('Payments', 'Refund')
  async refund(req: {
    paymentId: string;
    amount: string;
  }): Promise<{ paymentId: string; status: string }> {
    this.logger.log(`Refund (paymentId=${req.paymentId}, amount=${req.amount})`);
    const record = await this.service.refund(req.paymentId, req.amount);
    return { paymentId: record.paymentId, status: record.status };
  }
}

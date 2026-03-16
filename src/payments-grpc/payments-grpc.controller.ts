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
  authorize(req: AuthorizeRequest): AuthorizeResponse {
    this.logger.log(`Authorize (orderId=${req.orderId}, amount=${req.amount} ${req.currency})`);
    const record = this.service.authorize(
      req.orderId,
      req.amount,
      req.currency,
      req.idempotencyKey,
    );
    return { paymentId: record.paymentId, status: record.status };
  }

  @GrpcMethod('Payments', 'GetPaymentStatus')
  getPaymentStatus(req: GetPaymentStatusRequest): GetPaymentStatusResponse {
    const record = this.service.getStatus(req.paymentId);
    if (!record) {
      throw new RpcException({
        code: GrpcStatus.NOT_FOUND,
        message: `Payment ${req.paymentId} not found`,
      });
    }
    return { paymentId: record.paymentId, status: record.status };
  }

  @GrpcMethod('Payments', 'Capture')
  capture(req: { paymentId: string }): { paymentId: string; status: string } {
    // Stub — not implemented
    this.logger.log(`Capture stub (paymentId=${req.paymentId})`);
    return { paymentId: req.paymentId, status: 'CAPTURED' };
  }

  @GrpcMethod('Payments', 'Refund')
  refund(req: { paymentId: string; amount: string }): { paymentId: string; status: string } {
    // Stub — not implemented
    this.logger.log(`Refund stub (paymentId=${req.paymentId})`);
    return { paymentId: req.paymentId, status: 'REFUNDED' };
  }
}

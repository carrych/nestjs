import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

interface PaymentRecord {
  paymentId: string;
  orderId: number;
  amount: string;
  currency: string;
  status: string;
}

@Injectable()
export class PaymentsGrpcService {
  private readonly logger = new Logger(PaymentsGrpcService.name);
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly idempotencyIndex = new Map<string, string>(); // idempotencyKey → paymentId

  authorize(
    orderId: number,
    amount: string,
    currency: string,
    idempotencyKey?: string,
  ): PaymentRecord {
    if (idempotencyKey) {
      const existingId = this.idempotencyIndex.get(idempotencyKey);
      if (existingId) {
        const existing = this.payments.get(existingId)!;
        this.logger.log(`Authorize idempotent (key=${idempotencyKey}, paymentId=${existingId})`);
        return existing;
      }
    }

    const paymentId = randomUUID();
    const record: PaymentRecord = { paymentId, orderId, amount, currency, status: 'AUTHORIZED' };

    this.payments.set(paymentId, record);
    if (idempotencyKey) {
      this.idempotencyIndex.set(idempotencyKey, paymentId);
    }

    this.logger.log(`Authorize ok (paymentId=${paymentId}, orderId=${orderId}, amount=${amount})`);
    return record;
  }

  getStatus(paymentId: string): PaymentRecord | undefined {
    return this.payments.get(paymentId);
  }
}

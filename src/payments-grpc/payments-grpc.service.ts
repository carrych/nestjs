import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { Payment } from '../payments/entities/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { PaymentType } from '../payments/enums/payment-type.enum';
import { PaymentMethod } from '../payments/enums/payment-method.enum';

export interface PaymentRecord {
  paymentId: string;
  orderId: number;
  amount: string;
  currency: string;
  status: string;
}

@Injectable()
export class PaymentsGrpcService {
  private readonly logger = new Logger(PaymentsGrpcService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  async authorize(
    orderId: number,
    amount: string,
    currency: string,
    idempotencyKey?: string,
  ): Promise<PaymentRecord> {
    // Idempotency: check if a payment with this transaction_number already exists
    if (idempotencyKey) {
      const existing = await this.paymentRepository.findOne({
        where: { transactionNumber: idempotencyKey },
      });
      if (existing) {
        this.logger.log(`Authorize idempotent (key=${idempotencyKey}, id=${existing.id})`);
        return this.toRecord(existing, currency);
      }
    }

    const transactionNumber = randomUUID();
    const payment = this.paymentRepository.create({
      orderId,
      userId: 0, // gRPC callers don't always pass userId — default to 0
      transactionNumber: idempotencyKey ?? transactionNumber,
      amount,
      status: PaymentStatus.PENDING,
      type: PaymentType.IN,
      method: PaymentMethod.BANK_TRANSFER,
    });

    const saved = await this.paymentRepository.save(payment);
    this.logger.log(`Authorize ok (paymentId=${saved.transactionNumber}, orderId=${orderId}, amount=${amount})`);
    return this.toRecord(saved, currency);
  }

  async getStatus(paymentId: string): Promise<PaymentRecord | undefined> {
    const payment = await this.paymentRepository.findOne({
      where: { transactionNumber: paymentId },
    });
    if (!payment) return undefined;
    return this.toRecord(payment, 'UAH');
  }

  async capture(paymentId: string): Promise<PaymentRecord | undefined> {
    const payment = await this.paymentRepository.findOne({
      where: { transactionNumber: paymentId },
    });
    if (!payment) return undefined;

    payment.status = PaymentStatus.RECEIVED;
    const updated = await this.paymentRepository.save(payment);
    this.logger.log(`Capture ok (paymentId=${paymentId})`);
    return this.toRecord(updated, 'UAH');
  }

  async refund(paymentId: string, amount: string): Promise<PaymentRecord> {
    const original = await this.paymentRepository.findOne({
      where: { transactionNumber: paymentId },
    });

    const refund = this.paymentRepository.create({
      orderId: original?.orderId ?? 0,
      userId: original?.userId ?? 0,
      transactionNumber: `refund-${randomUUID()}`,
      amount,
      status: PaymentStatus.RECEIVED,
      type: PaymentType.OUT,
      method: original?.method ?? PaymentMethod.BANK_TRANSFER,
    });

    const saved = await this.paymentRepository.save(refund);
    this.logger.log(`Refund ok (original=${paymentId}, refundId=${saved.transactionNumber})`);
    return this.toRecord(saved, 'UAH');
  }

  private toRecord(payment: Payment, currency: string): PaymentRecord {
    return {
      paymentId: payment.transactionNumber ?? String(payment.id),
      orderId: Number(payment.orderId),
      amount: payment.amount,
      currency,
      status: payment.status.toUpperCase(),
    };
  }
}

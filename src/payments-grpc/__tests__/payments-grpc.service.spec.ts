import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';

import { PaymentsGrpcService } from '../payments-grpc.service';
import { Payment } from '../../payments/entities/payment.entity';
import { PaymentStatus } from '../../payments/enums/payment-status.enum';
import { PaymentType } from '../../payments/enums/payment-type.enum';
import { PaymentMethod } from '../../payments/enums/payment-method.enum';

const mockRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
};

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 1,
    orderId: 10,
    userId: 0,
    transactionNumber: 'txn-uuid-1',
    amount: '100.00',
    status: PaymentStatus.PENDING,
    type: PaymentType.IN,
    method: PaymentMethod.BANK_TRANSFER,
    createdAt: new Date(),
    order: null as any,
    ...overrides,
  } as Payment;
}

describe('PaymentsGrpcService', () => {
  let service: PaymentsGrpcService;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsGrpcService,
        { provide: getRepositoryToken(Payment), useValue: mockRepo },
      ],
    }).compile();

    service = module.get(PaymentsGrpcService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── authorize() ───────────────────────────────────────────────────────────────

  describe('authorize()', () => {
    it('inserts a new payment and returns PENDING record', async () => {
      const payment = makePayment({ transactionNumber: 'txn-1', status: PaymentStatus.PENDING });
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue(payment);
      mockRepo.save.mockResolvedValue(payment);

      const record = await service.authorize(1, '100.00', 'UAH');

      expect(record.status).toBe('PENDING');
      expect(record.amount).toBe('100.00');
      expect(record.orderId).toBe(10);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('returns existing record when idempotency key matches', async () => {
      const existing = makePayment({
        transactionNumber: 'idem-key',
        status: PaymentStatus.PENDING,
      });
      mockRepo.findOne.mockResolvedValue(existing);

      const record = await service.authorize(1, '100.00', 'UAH', 'idem-key');

      expect(record.paymentId).toBe('idem-key');
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('inserts new payment when idempotency key not found', async () => {
      const payment = makePayment({ transactionNumber: 'new-idem-key' });
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue(payment);
      mockRepo.save.mockResolvedValue(payment);

      await service.authorize(2, '200.00', 'UAH', 'new-idem-key');

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  // ── getStatus() ───────────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('returns record when found', async () => {
      const payment = makePayment({ transactionNumber: 'txn-abc', status: PaymentStatus.RECEIVED });
      mockRepo.findOne.mockResolvedValue(payment);

      const record = await service.getStatus('txn-abc');

      expect(record).toBeDefined();
      expect(record!.status).toBe('RECEIVED');
    });

    it('returns undefined for unknown paymentId', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const record = await service.getStatus('non-existent');

      expect(record).toBeUndefined();
    });
  });

  // ── capture() ─────────────────────────────────────────────────────────────────

  describe('capture()', () => {
    it('updates status to RECEIVED', async () => {
      const payment = makePayment({ status: PaymentStatus.PENDING });
      mockRepo.findOne.mockResolvedValue(payment);
      mockRepo.save.mockResolvedValue({ ...payment, status: PaymentStatus.RECEIVED });

      const record = await service.capture('txn-1');

      expect(record!.status).toBe('RECEIVED');
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('returns undefined when payment not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const record = await service.capture('non-existent');

      expect(record).toBeUndefined();
    });
  });

  // ── refund() ──────────────────────────────────────────────────────────────────

  describe('refund()', () => {
    it('creates a new OUT payment with RECEIVED status', async () => {
      const original = makePayment({ transactionNumber: 'orig', orderId: 5 });
      mockRepo.findOne.mockResolvedValue(original);

      const refundPayment = makePayment({
        transactionNumber: 'refund-uuid',
        type: PaymentType.OUT,
        status: PaymentStatus.RECEIVED,
        amount: '50.00',
      });
      mockRepo.create.mockReturnValue(refundPayment);
      mockRepo.save.mockResolvedValue(refundPayment);

      const record = await service.refund('orig', '50.00');

      expect(record.status).toBe('RECEIVED');
      const createCall = mockRepo.create.mock.calls[0][0];
      expect(createCall.type).toBe(PaymentType.OUT);
      expect(createCall.status).toBe(PaymentStatus.RECEIVED);
    });
  });
});

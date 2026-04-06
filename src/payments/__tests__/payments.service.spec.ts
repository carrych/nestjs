import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { PaymentsService } from '../payments.service';
import { Payment } from '../entities/payment.entity';
import { Order } from '../../orders/entities/order.entity';
import { RabbitmqService } from '../../rabbitmq/rabbitmq.service';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

const mockPaymentRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
};

const mockOrderRepo = {
  findOne: jest.fn(),
};

const mockRabbitmqService = {
  publishStatusChange: jest.fn(),
};

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 1,
    orderId: 10,
    userId: 5,
    transactionNumber: null,
    amount: '500',
    status: PaymentStatus.PENDING,
    type: PaymentType.IN,
    method: PaymentMethod.CASH,
    createdAt: new Date(),
    order: {} as Order,
    ...overrides,
  } as Payment;
}

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: RabbitmqService, useValue: mockRabbitmqService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findOne()', () => {
    it('throws NotFoundException when not found', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });

    it('returns payment when found', async () => {
      const payment = makePayment();
      mockPaymentRepo.findOne.mockResolvedValue(payment);
      await expect(service.findOne(1)).resolves.toEqual(payment);
    });
  });

  describe('update()', () => {
    it('publishes status.changes when status changes', async () => {
      const payment = makePayment({ status: PaymentStatus.PENDING, orderId: 10 });
      mockPaymentRepo.findOne.mockResolvedValue(payment);
      mockPaymentRepo.save.mockResolvedValue({ ...payment, status: PaymentStatus.RECEIVED });

      await service.update(1, { status: PaymentStatus.RECEIVED });

      expect(mockRabbitmqService.publishStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'payment', status: PaymentStatus.RECEIVED }),
      );
    });

    it('does not publish when status is unchanged', async () => {
      const payment = makePayment({ status: PaymentStatus.RECEIVED });
      mockPaymentRepo.findOne.mockResolvedValue(payment);
      mockPaymentRepo.save.mockResolvedValue(payment);

      await service.update(1, { status: PaymentStatus.RECEIVED });

      expect(mockRabbitmqService.publishStatusChange).not.toHaveBeenCalled();
    });

    it('does not publish when dto has no status field', async () => {
      const payment = makePayment();
      mockPaymentRepo.findOne.mockResolvedValue(payment);
      mockPaymentRepo.save.mockResolvedValue(payment);

      await service.update(1, { amount: 999 });

      expect(mockRabbitmqService.publishStatusChange).not.toHaveBeenCalled();
    });

    it('updates amount when provided', async () => {
      const payment = makePayment({ amount: '100' });
      mockPaymentRepo.findOne.mockResolvedValue(payment);
      mockPaymentRepo.save.mockImplementation(async (p: Payment) => p);

      const result = await service.update(1, { amount: 250 });

      expect(result.amount).toBe('250');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

import { PaymentsController } from '../payments.controller';
import { PaymentsService } from '../payments.service';
import { PAYMENTS_GRPC_CLIENT } from '../../payments-grpc-client/payments-grpc-client.module';

const mockPaymentsService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const mockGrpcService = {
  authorize: jest.fn(),
  capture: jest.fn(),
  refund: jest.fn(),
  getPaymentStatus: jest.fn(),
};

const mockGrpcClient = {
  getService: jest.fn().mockReturnValue(mockGrpcService),
};

describe('PaymentsController — gRPC endpoints', () => {
  let controller: PaymentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: PAYMENTS_GRPC_CLIENT, useValue: mockGrpcClient },
      ],
    }).compile();

    controller = module.get(PaymentsController);
    controller.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  describe('authorize()', () => {
    it('delegates to gRPC authorize with defaults', () => {
      const response = { paymentId: 'uuid-1', status: 'PENDING' };
      mockGrpcService.authorize.mockReturnValue(of(response));

      const result = controller.authorize({ orderId: 1, amount: '100.00' });

      expect(mockGrpcService.authorize).toHaveBeenCalledWith({
        orderId: 1,
        amount: '100.00',
        currency: 'UAH',
        idempotencyKey: undefined,
      });
      expect(result).toBeDefined();
    });

    it('passes idempotencyKey and currency when provided', () => {
      mockGrpcService.authorize.mockReturnValue(of({ paymentId: 'uuid-2', status: 'PENDING' }));

      controller.authorize({
        orderId: 2,
        amount: '500.00',
        currency: 'EUR',
        idempotencyKey: 'order-abc',
      });

      expect(mockGrpcService.authorize).toHaveBeenCalledWith({
        orderId: 2,
        amount: '500.00',
        currency: 'EUR',
        idempotencyKey: 'order-abc',
      });
    });
  });

  describe('capture()', () => {
    it('delegates to gRPC capture', () => {
      mockGrpcService.capture.mockReturnValue(of({ paymentId: 'uuid-1', status: 'RECEIVED' }));

      controller.capture('uuid-1');

      expect(mockGrpcService.capture).toHaveBeenCalledWith({ paymentId: 'uuid-1' });
    });
  });

  describe('refund()', () => {
    it('delegates to gRPC refund', () => {
      mockGrpcService.refund.mockReturnValue(of({ paymentId: 'refund-uuid', status: 'RECEIVED' }));

      controller.refund('uuid-1', { amount: '50.00' });

      expect(mockGrpcService.refund).toHaveBeenCalledWith({ paymentId: 'uuid-1', amount: '50.00' });
    });
  });

  describe('getStatus()', () => {
    it('delegates to gRPC getPaymentStatus', () => {
      mockGrpcService.getPaymentStatus.mockReturnValue(of({ paymentId: 'uuid-1', status: 'RECEIVED' }));

      controller.getStatus('uuid-1');

      expect(mockGrpcService.getPaymentStatus).toHaveBeenCalledWith({ paymentId: 'uuid-1' });
    });
  });
});

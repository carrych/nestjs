import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';

import { PaymentsGrpcController } from '../payments-grpc.controller';
import { PaymentsGrpcService } from '../payments-grpc.service';
import { PaymentRecord } from '../payments-grpc.service';

describe('PaymentsGrpcController', () => {
  let controller: PaymentsGrpcController;
  let service: jest.Mocked<Pick<PaymentsGrpcService, 'authorize' | 'getStatus' | 'capture' | 'refund'>>;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    service = {
      authorize: jest.fn(),
      getStatus: jest.fn(),
      capture: jest.fn(),
      refund: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsGrpcController],
      providers: [{ provide: PaymentsGrpcService, useValue: service }],
    }).compile();

    controller = module.get(PaymentsGrpcController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── authorize() ───────────────────────────────────────────────────────────────

  describe('authorize()', () => {
    it('returns paymentId and status from service', async () => {
      const record: PaymentRecord = { paymentId: 'pay-uuid-1', orderId: 1, amount: '100.00', currency: 'UAH', status: 'PENDING' };
      service.authorize.mockResolvedValue(record);

      const result = await controller.authorize({ orderId: 1, amount: '100.00', currency: 'UAH' });

      expect(result).toEqual({ paymentId: 'pay-uuid-1', status: 'PENDING' });
    });

    it('passes idempotencyKey to service when provided', async () => {
      const record: PaymentRecord = { paymentId: 'pay-uuid-2', orderId: 2, amount: '50.00', currency: 'UAH', status: 'PENDING' };
      service.authorize.mockResolvedValue(record);

      await controller.authorize({ orderId: 2, amount: '50.00', currency: 'UAH', idempotencyKey: 'order-key-abc' });

      expect(service.authorize).toHaveBeenCalledWith(2, '50.00', 'UAH', 'order-key-abc');
    });

    it('calls service without idempotencyKey when not provided', async () => {
      const record: PaymentRecord = { paymentId: 'pay-uuid-3', orderId: 3, amount: '75.00', currency: 'UAH', status: 'PENDING' };
      service.authorize.mockResolvedValue(record);

      await controller.authorize({ orderId: 3, amount: '75.00', currency: 'UAH' });

      expect(service.authorize).toHaveBeenCalledWith(3, '75.00', 'UAH', undefined);
    });
  });

  // ── getPaymentStatus() ────────────────────────────────────────────────────────

  describe('getPaymentStatus()', () => {
    it('returns paymentId and status for a known payment', async () => {
      const record: PaymentRecord = { paymentId: 'pay-uuid-1', orderId: 1, amount: '100.00', currency: 'UAH', status: 'PENDING' };
      service.getStatus.mockResolvedValue(record);

      const result = await controller.getPaymentStatus({ paymentId: 'pay-uuid-1' });

      expect(result).toEqual({ paymentId: 'pay-uuid-1', status: 'PENDING' });
    });

    it('throws RpcException with NOT_FOUND for unknown paymentId', async () => {
      service.getStatus.mockResolvedValue(undefined);

      await expect(controller.getPaymentStatus({ paymentId: 'ghost-id' })).rejects.toThrow(RpcException);

      try {
        await controller.getPaymentStatus({ paymentId: 'ghost-id' });
      } catch (err) {
        const error = (err as RpcException).getError() as { code: number; message: string };
        expect(error.code).toBe(GrpcStatus.NOT_FOUND);
        expect(error.message).toContain('ghost-id');
      }
    });
  });

  // ── capture() ─────────────────────────────────────────────────────────────────

  describe('capture()', () => {
    it('returns RECEIVED status after capture', async () => {
      const record: PaymentRecord = { paymentId: 'pay-uuid-1', orderId: 1, amount: '100.00', currency: 'UAH', status: 'RECEIVED' };
      service.capture.mockResolvedValue(record);

      const result = await controller.capture({ paymentId: 'pay-uuid-1' });

      expect(result).toEqual({ paymentId: 'pay-uuid-1', status: 'RECEIVED' });
    });

    it('throws NOT_FOUND when payment not found', async () => {
      service.capture.mockResolvedValue(undefined);

      await expect(controller.capture({ paymentId: 'ghost-id' })).rejects.toThrow(RpcException);
    });
  });

  // ── refund() ──────────────────────────────────────────────────────────────────

  describe('refund()', () => {
    it('returns new refund payment record', async () => {
      const record: PaymentRecord = { paymentId: 'refund-uuid', orderId: 1, amount: '50.00', currency: 'UAH', status: 'RECEIVED' };
      service.refund.mockResolvedValue(record);

      const result = await controller.refund({ paymentId: 'pay-uuid-1', amount: '50.00' });

      expect(result.status).toBe('RECEIVED');
      expect(service.refund).toHaveBeenCalledWith('pay-uuid-1', '50.00');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';

import { PaymentsGrpcController } from '../payments-grpc.controller';
import { PaymentsGrpcService } from '../payments-grpc.service';

describe('PaymentsGrpcController', () => {
  let controller: PaymentsGrpcController;
  let service: { authorize: jest.Mock; getStatus: jest.Mock };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    service = {
      authorize: jest.fn(),
      getStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsGrpcController],
      providers: [{ provide: PaymentsGrpcService, useValue: service }],
    }).compile();

    controller = module.get(PaymentsGrpcController);
  });

  // ── authorize() ───────────────────────────────────────────────────────────────

  describe('authorize()', () => {
    it('returns paymentId and status from service', () => {
      service.authorize.mockReturnValue({
        paymentId: 'pay-uuid-1',
        orderId: 1,
        amount: '100.00',
        currency: 'UAH',
        status: 'AUTHORIZED',
      });

      const result = controller.authorize({
        orderId: 1,
        amount: '100.00',
        currency: 'UAH',
      });

      expect(result).toEqual({ paymentId: 'pay-uuid-1', status: 'AUTHORIZED' });
    });

    it('passes idempotencyKey to service when provided', () => {
      service.authorize.mockReturnValue({
        paymentId: 'pay-uuid-2',
        orderId: 2,
        amount: '50.00',
        currency: 'UAH',
        status: 'AUTHORIZED',
      });

      controller.authorize({
        orderId: 2,
        amount: '50.00',
        currency: 'UAH',
        idempotencyKey: 'order-key-abc',
      });

      expect(service.authorize).toHaveBeenCalledWith(2, '50.00', 'UAH', 'order-key-abc');
    });

    it('calls service without idempotencyKey when not provided', () => {
      service.authorize.mockReturnValue({
        paymentId: 'pay-uuid-3',
        orderId: 3,
        amount: '75.00',
        currency: 'UAH',
        status: 'AUTHORIZED',
      });

      controller.authorize({ orderId: 3, amount: '75.00', currency: 'UAH' });

      expect(service.authorize).toHaveBeenCalledWith(3, '75.00', 'UAH', undefined);
    });
  });

  // ── getPaymentStatus() ────────────────────────────────────────────────────────

  describe('getPaymentStatus()', () => {
    it('returns paymentId and status for a known payment', () => {
      service.getStatus.mockReturnValue({
        paymentId: 'pay-uuid-1',
        orderId: 1,
        amount: '100.00',
        currency: 'UAH',
        status: 'AUTHORIZED',
      });

      const result = controller.getPaymentStatus({ paymentId: 'pay-uuid-1' });

      expect(result).toEqual({ paymentId: 'pay-uuid-1', status: 'AUTHORIZED' });
    });

    it('throws RpcException with NOT_FOUND for unknown paymentId', () => {
      service.getStatus.mockReturnValue(undefined);

      expect(() => controller.getPaymentStatus({ paymentId: 'ghost-id' })).toThrow(
        RpcException,
      );

      try {
        controller.getPaymentStatus({ paymentId: 'ghost-id' });
      } catch (err) {
        expect(err).toBeInstanceOf(RpcException);
        const error = (err as RpcException).getError() as { code: number; message: string };
        expect(error.code).toBe(GrpcStatus.NOT_FOUND);
        expect(error.message).toContain('ghost-id');
      }
    });
  });

  // ── capture() (stub) ──────────────────────────────────────────────────────────

  describe('capture()', () => {
    it('returns CAPTURED status (stub)', () => {
      const result = controller.capture({ paymentId: 'pay-uuid-1' });
      expect(result).toEqual({ paymentId: 'pay-uuid-1', status: 'CAPTURED' });
    });
  });

  // ── refund() (stub) ───────────────────────────────────────────────────────────

  describe('refund()', () => {
    it('returns REFUNDED status (stub)', () => {
      const result = controller.refund({ paymentId: 'pay-uuid-1', amount: '50.00' });
      expect(result).toEqual({ paymentId: 'pay-uuid-1', status: 'REFUNDED' });
    });
  });
});

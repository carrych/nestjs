import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

import { PaymentsGrpcService } from '../payments-grpc.service';

describe('PaymentsGrpcService', () => {
  let service: PaymentsGrpcService;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentsGrpcService],
    }).compile();

    service = module.get(PaymentsGrpcService);
  });

  // ── authorize() ───────────────────────────────────────────────────────────────

  describe('authorize()', () => {
    it('returns a new AUTHORIZED payment record', () => {
      const record = service.authorize(1, '100.00', 'UAH');

      expect(record.paymentId).toEqual(expect.any(String));
      expect(record.status).toBe('AUTHORIZED');
      expect(record.orderId).toBe(1);
      expect(record.amount).toBe('100.00');
      expect(record.currency).toBe('UAH');
    });

    it('generates a unique paymentId per call (no idempotency key)', () => {
      const r1 = service.authorize(1, '50.00', 'UAH');
      const r2 = service.authorize(1, '50.00', 'UAH');

      expect(r1.paymentId).not.toBe(r2.paymentId);
    });

    it('returns the same record for the same idempotencyKey (idempotent)', () => {
      const first = service.authorize(1, '100.00', 'UAH', 'idem-key-1');
      const second = service.authorize(1, '100.00', 'UAH', 'idem-key-1');

      expect(second.paymentId).toBe(first.paymentId);
      expect(second).toBe(first);
    });

    it('creates distinct records for different idempotencyKeys', () => {
      const r1 = service.authorize(1, '100.00', 'UAH', 'key-a');
      const r2 = service.authorize(2, '200.00', 'UAH', 'key-b');

      expect(r1.paymentId).not.toBe(r2.paymentId);
    });

    it('creates new record each call when idempotencyKey is omitted', () => {
      const r1 = service.authorize(1, '100.00', 'UAH', undefined);
      const r2 = service.authorize(1, '100.00', 'UAH', undefined);

      expect(r1.paymentId).not.toBe(r2.paymentId);
    });
  });

  // ── getStatus() ───────────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('returns the record after it was authorized', () => {
      const record = service.authorize(5, '250.00', 'UAH');
      const found = service.getStatus(record.paymentId);

      expect(found).toBeDefined();
      expect(found!.paymentId).toBe(record.paymentId);
      expect(found!.status).toBe('AUTHORIZED');
    });

    it('returns undefined for an unknown paymentId', () => {
      expect(service.getStatus('non-existent-id')).toBeUndefined();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsResolver } from '../resolvers/payments.resolver';
import { PaymentsService } from '../../../payments/payments.service';
import { Payment } from '../../../payments/entities/payment.entity';
import { PaymentStatus } from '../../../payments/enums/payment-status.enum';

describe('PaymentsResolver', () => {
  let resolver: PaymentsResolver;
  let paymentsService: { findAllWithCount: jest.Mock };

  beforeEach(async () => {
    paymentsService = { findAllWithCount: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsResolver,
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();

    resolver = module.get<PaymentsResolver>(PaymentsResolver);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return payments connection with defaults', async () => {
    const payment = { id: 1, amount: '100.00' } as unknown as Payment;
    paymentsService.findAllWithCount.mockResolvedValue([[payment], 1]);

    const result = await resolver.getPayments();

    expect(result.nodes).toEqual([payment]);
    expect(result.totalCount).toBe(1);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it('should pass filter', async () => {
    paymentsService.findAllWithCount.mockResolvedValue([[], 0]);

    await resolver.getPayments({ orderId: 5, status: PaymentStatus.PENDING });

    expect(paymentsService.findAllWithCount).toHaveBeenCalledWith({
      limit: 10,
      offset: 0,
      orderId: 5,
      status: PaymentStatus.PENDING,
    });
  });
});

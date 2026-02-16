import { Test, TestingModule } from '@nestjs/testing';
import { ShippingResolver } from '../resolvers/shipping.resolver';
import { ShippingService } from '../../../shipping/shipping.service';
import { Shipping } from '../../../shipping/entities/shipping.entity';

describe('ShippingResolver', () => {
  let resolver: ShippingResolver;
  let shippingService: { findAllWithCount: jest.Mock };

  beforeEach(async () => {
    shippingService = { findAllWithCount: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingResolver,
        { provide: ShippingService, useValue: shippingService },
      ],
    }).compile();

    resolver = module.get<ShippingResolver>(ShippingResolver);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return shipping connection with defaults', async () => {
    const shipment = { id: 1, trackingNumber: 'TRK-001' } as unknown as Shipping;
    shippingService.findAllWithCount.mockResolvedValue([[shipment], 1]);

    const result = await resolver.getShipments();

    expect(shippingService.findAllWithCount).toHaveBeenCalledWith(undefined, 10, 0);
    expect(result.nodes).toEqual([shipment]);
    expect(result.totalCount).toBe(1);
  });

  it('should pass orderId filter', async () => {
    shippingService.findAllWithCount.mockResolvedValue([[], 0]);

    await resolver.getShipments({ orderId: 7 }, { limit: 5, offset: 0 });

    expect(shippingService.findAllWithCount).toHaveBeenCalledWith(7, 5, 0);
  });
});

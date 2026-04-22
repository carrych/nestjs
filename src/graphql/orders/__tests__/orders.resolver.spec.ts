import { Test, TestingModule } from '@nestjs/testing';
import { OrdersResolver } from '../resolvers/orders.resolver';
import { OrdersService } from '../../../orders/orders.service';
import { OrderStatus } from '../../../orders/enums/order-status.enum';
import { Order } from '../../../orders/entities/order.entity';

describe('OrdersResolver', () => {
  let resolver: OrdersResolver;
  let ordersService: { findAllWithCount: jest.Mock };

  beforeEach(async () => {
    ordersService = {
      findAllWithCount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersResolver, { provide: OrdersService, useValue: ordersService }],
    }).compile();

    resolver = module.get<OrdersResolver>(OrdersResolver);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getOrders', () => {
    const mockOrder = {
      id: 1,
      orderNumber: 1,
      userId: 10,
      status: OrderStatus.PENDING,
      createdAt: new Date('2025-01-01'),
      items: [],
    } as unknown as Order;

    it('should return orders connection with defaults', async () => {
      ordersService.findAllWithCount.mockResolvedValue([[mockOrder], 1]);

      const result = await resolver.getOrders();

      expect(ordersService.findAllWithCount).toHaveBeenCalledWith({
        limit: 10,
        offset: 0,
        status: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      });
      expect(result.nodes).toEqual([mockOrder]);
      expect(result.totalCount).toBe(1);
      expect(result.pageInfo.hasNextPage).toBe(false);
    });

    it('should pass filter and pagination to service', async () => {
      ordersService.findAllWithCount.mockResolvedValue([[], 0]);

      await resolver.getOrders(
        { status: OrderStatus.PROCESSING, dateFrom: '2025-01-01', dateTo: '2025-12-31' },
        { limit: 5, offset: 10 },
      );

      expect(ordersService.findAllWithCount).toHaveBeenCalledWith({
        limit: 5,
        offset: 10,
        status: OrderStatus.PROCESSING,
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
      });
    });

    it('should cap limit at 50', async () => {
      ordersService.findAllWithCount.mockResolvedValue([[], 0]);

      await resolver.getOrders(undefined, { limit: 100, offset: 0 });

      expect(ordersService.findAllWithCount).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
    });

    it('should set hasNextPage true when more results exist', async () => {
      ordersService.findAllWithCount.mockResolvedValue([[mockOrder], 15]);

      const result = await resolver.getOrders(undefined, { limit: 5, offset: 0 });

      expect(result.pageInfo.hasNextPage).toBe(true);
    });

    it('should set hasNextPage false on last page', async () => {
      ordersService.findAllWithCount.mockResolvedValue([[mockOrder], 11]);

      const result = await resolver.getOrders(undefined, { limit: 5, offset: 10 });

      expect(result.pageInfo.hasNextPage).toBe(false);
    });

    it('should return empty nodes for no results', async () => {
      ordersService.findAllWithCount.mockResolvedValue([[], 0]);

      const result = await resolver.getOrders();

      expect(result.nodes).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.pageInfo.hasNextPage).toBe(false);
    });
  });
});

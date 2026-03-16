import { Test, TestingModule } from '@nestjs/testing';
import { OrderItemResolver } from '../resolvers/order-item.resolver';
import { ProductLoader } from '../loaders/product.loader';
import { OrderItem } from '../../../orders/entities/order-item.entity';
import { Product } from '../../../products/entities/product.entity';

describe('OrderItemResolver', () => {
  let resolver: OrderItemResolver;
  let productLoader: { load: jest.Mock };

  beforeEach(async () => {
    productLoader = { load: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderItemResolver,
        { provide: ProductLoader, useValue: productLoader },
      ],
    }).compile();

    resolver = module.get<OrderItemResolver>(OrderItemResolver);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getProduct', () => {
    it('should load product via DataLoader', async () => {
      const product = { id: 5, name: 'Widget', price: '19.99' } as unknown as Product;
      productLoader.load.mockResolvedValue(product);

      const orderItem = { productId: 5 } as OrderItem;
      const result = await resolver.getProduct(orderItem);

      expect(productLoader.load).toHaveBeenCalledWith(5);
      expect(result).toEqual(product);
    });

    it('should handle string productId from entity', async () => {
      const product = { id: 7, name: 'Gadget' } as unknown as Product;
      productLoader.load.mockResolvedValue(product);

      // TypeORM bigint columns can come as strings
      const orderItem = { productId: '7' } as unknown as OrderItem;
      const result = await resolver.getProduct(orderItem);

      expect(productLoader.load).toHaveBeenCalledWith(7);
      expect(result).toEqual(product);
    });
  });
});

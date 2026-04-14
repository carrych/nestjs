import { Test, TestingModule } from '@nestjs/testing';
import { ProductsResolver } from '../resolvers/products.resolver';
import { ProductsService } from '../../../products/products.service';
import { Product } from '../../../products/entities/product.entity';

describe('ProductsResolver', () => {
  let resolver: ProductsResolver;
  let productsService: { findAllWithCount: jest.Mock };

  beforeEach(async () => {
    productsService = { findAllWithCount: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsResolver, { provide: ProductsService, useValue: productsService }],
    }).compile();

    resolver = module.get<ProductsResolver>(ProductsResolver);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return products connection with defaults', async () => {
    const product = { id: 1, name: 'Widget' } as unknown as Product;
    productsService.findAllWithCount.mockResolvedValue([[product], 1]);

    const result = await resolver.getProducts();

    expect(productsService.findAllWithCount).toHaveBeenCalledWith({
      limit: 10,
      offset: 0,
      brand: undefined,
      search: undefined,
    });
    expect(result.nodes).toEqual([product]);
    expect(result.totalCount).toBe(1);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it('should pass filter and pagination', async () => {
    productsService.findAllWithCount.mockResolvedValue([[], 0]);

    await resolver.getProducts({ brand: 'Acme', search: 'widget' }, { limit: 5, offset: 10 });

    expect(productsService.findAllWithCount).toHaveBeenCalledWith({
      limit: 5,
      offset: 10,
      brand: 'Acme',
      search: 'widget',
    });
  });

  it('should cap limit at 50', async () => {
    productsService.findAllWithCount.mockResolvedValue([[], 0]);

    await resolver.getProducts(undefined, { limit: 100, offset: 0 });

    expect(productsService.findAllWithCount).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });
});

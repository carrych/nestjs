import { Test, TestingModule } from '@nestjs/testing';
import { ProductLoader } from '../loaders/product.loader';
import { ProductsService } from '../../../products/products.service';
import { Product } from '../../../products/entities/product.entity';

describe('ProductLoader', () => {
  let loader: ProductLoader;
  let productsService: { findByIds: jest.Mock };

  beforeEach(async () => {
    productsService = { findByIds: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductLoader,
        { provide: ProductsService, useValue: productsService },
      ],
    }).compile();

    loader = await module.resolve<ProductLoader>(ProductLoader);
  });

  afterEach(() => jest.clearAllMocks());

  it('should batch multiple loads into a single findByIds call', async () => {
    const products = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ] as unknown as Product[];

    productsService.findByIds.mockResolvedValue(products);

    // Request all three in parallel — DataLoader batches them
    const [p1, p2, p3] = await Promise.all([
      loader.load(1),
      loader.load(2),
      loader.load(3),
    ]);

    expect(productsService.findByIds).toHaveBeenCalledTimes(1);
    expect(productsService.findByIds).toHaveBeenCalledWith([1, 2, 3]);
    expect(p1).toEqual(products[0]);
    expect(p2).toEqual(products[1]);
    expect(p3).toEqual(products[2]);
  });

  it('should return results in correct order regardless of DB order', async () => {
    const products = [
      { id: 3, name: 'C' },
      { id: 1, name: 'A' },
    ] as unknown as Product[];

    productsService.findByIds.mockResolvedValue(products);

    const [p1, p3] = await Promise.all([loader.load(1), loader.load(3)]);

    expect(p1).toEqual({ id: 1, name: 'A' });
    expect(p3).toEqual({ id: 3, name: 'C' });
  });

  it('should return error for missing product', async () => {
    productsService.findByIds.mockResolvedValue([]);

    await expect(loader.load(999)).rejects.toThrow('Product #999 not found');
  });

  it('should deduplicate identical IDs', async () => {
    const products = [{ id: 1, name: 'A' }] as unknown as Product[];
    productsService.findByIds.mockResolvedValue(products);

    const [p1, p1Again] = await Promise.all([loader.load(1), loader.load(1)]);

    expect(productsService.findByIds).toHaveBeenCalledWith([1]);
    expect(p1).toBe(p1Again);
  });
});

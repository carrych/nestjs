import { Test, TestingModule } from '@nestjs/testing';
import { StocksResolver } from '../resolvers/stocks.resolver';
import { StocksService } from '../../../stocks/stocks.service';
import { ProductLoader } from '../../orders/loaders/product.loader';
import { Stock } from '../../../stocks/entities/stock.entity';
import { Product } from '../../../products/entities/product.entity';

describe('StocksResolver', () => {
  let resolver: StocksResolver;
  let stocksService: { findAll: jest.Mock; findByProductId: jest.Mock };
  let productLoader: { load: jest.Mock };

  beforeEach(async () => {
    stocksService = { findAll: jest.fn(), findByProductId: jest.fn() };
    productLoader = { load: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StocksResolver,
        { provide: StocksService, useValue: stocksService },
        { provide: ProductLoader, useValue: productLoader },
      ],
    }).compile();

    resolver = module.get<StocksResolver>(StocksResolver);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return all stocks', async () => {
    const stocks = [{ id: 1, stock: 100, reserved: 5 }] as unknown as Stock[];
    stocksService.findAll.mockResolvedValue(stocks);

    const result = await resolver.getStocks();

    expect(result).toEqual(stocks);
  });

  it('should return stock by productId', async () => {
    const stock = { id: 1, productId: 3, stock: 50 } as unknown as Stock;
    stocksService.findByProductId.mockResolvedValue(stock);

    const result = await resolver.getStock(3);

    expect(stocksService.findByProductId).toHaveBeenCalledWith(3);
    expect(result).toEqual(stock);
  });

  it('should resolve product via DataLoader', async () => {
    const product = { id: 5, name: 'Widget' } as unknown as Product;
    productLoader.load.mockResolvedValue(product);

    const stock = { productId: 5 } as Stock;
    const result = await resolver.getProduct(stock);

    expect(productLoader.load).toHaveBeenCalledWith(5);
    expect(result).toEqual(product);
  });
});

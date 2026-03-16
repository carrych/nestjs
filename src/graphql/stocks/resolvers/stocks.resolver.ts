import { Resolver, Query, Args, Int, ResolveField, Parent } from '@nestjs/graphql';
import { StocksService } from '../../../stocks/stocks.service';
import { StockType } from '../types/stock.type';
import { OrderProductType } from '../../orders/types/product.type';
import { ProductLoader } from '../../orders/loaders/product.loader';
import { Stock } from '../../../stocks/entities/stock.entity';

@Resolver(() => StockType)
export class StocksResolver {
  constructor(
    private readonly stocksService: StocksService,
    private readonly productLoader: ProductLoader,
  ) {}

  @Query(() => [StockType], { name: 'stocks' })
  async getStocks(): Promise<StockType[]> {
    return this.stocksService.findAll();
  }

  @Query(() => StockType, { name: 'stock' })
  async getStock(
    @Args('productId', { type: () => Int }) productId: number,
  ): Promise<StockType> {
    return this.stocksService.findByProductId(productId);
  }

  @ResolveField('product', () => OrderProductType)
  async getProduct(@Parent() stock: Stock): Promise<OrderProductType> {
    return this.productLoader.load(Number(stock.productId));
  }
}

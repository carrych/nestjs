import { Module } from '@nestjs/common';
import { StocksModule } from '../../stocks/stocks.module';
import { ProductsModule } from '../../products/products.module';
import { StocksResolver } from './resolvers/stocks.resolver';
import { ProductLoader } from '../orders/loaders/product.loader';

@Module({
  imports: [StocksModule, ProductsModule],
  providers: [StocksResolver, ProductLoader],
})
export class GraphqlStocksModule {}

import { Module } from '@nestjs/common';
import { ProductsModule } from '../../products/products.module';
import { ProductsResolver } from './resolvers/products.resolver';

@Module({
  imports: [ProductsModule],
  providers: [ProductsResolver],
})
export class GraphqlProductsModule {}

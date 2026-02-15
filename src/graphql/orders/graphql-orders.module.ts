import { Module } from '@nestjs/common';
import { OrdersModule } from '../../orders/orders.module';
import { ProductsModule } from '../../products/products.module';
import { OrdersResolver } from './resolvers/orders.resolver';
import { OrderItemResolver } from './resolvers/order-item.resolver';
import { ProductLoader } from './loaders/product.loader';

@Module({
  imports: [OrdersModule, ProductsModule],
  providers: [OrdersResolver, OrderItemResolver, ProductLoader],
})
export class GraphqlOrdersModule {}

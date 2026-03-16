import { Resolver, ResolveField, Parent } from '@nestjs/graphql';
import { OrderItemType } from '../types/order-item.type';
import { OrderProductType } from '../types/product.type';
import { ProductLoader } from '../loaders/product.loader';
import { OrderItem } from '../../../orders/entities/order-item.entity';

@Resolver(() => OrderItemType)
export class OrderItemResolver {
  constructor(private readonly productLoader: ProductLoader) {}

  @ResolveField('product', () => OrderProductType)
  async getProduct(@Parent() orderItem: OrderItem): Promise<OrderProductType> {
    return this.productLoader.load(Number(orderItem.productId));
  }
}

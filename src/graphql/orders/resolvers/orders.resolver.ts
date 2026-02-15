import { Resolver, Query, Args } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { OrdersService } from '../../../orders/orders.service';
import { OrdersConnection } from '../types/orders-connection.type';
import { OrderType } from '../types/order.type';
import { OrdersFilterInput } from '../inputs/orders-filter.input';
import { OrdersPaginationInput } from '../inputs/orders-pagination.input';

@Resolver(() => OrderType)
export class OrdersResolver {
  private readonly logger = new Logger(OrdersResolver.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Query(() => OrdersConnection, { name: 'orders' })
  async getOrders(
    @Args('filter', { nullable: true }) filter?: OrdersFilterInput,
    @Args('pagination', { nullable: true }) pagination?: OrdersPaginationInput,
  ): Promise<OrdersConnection> {
    const limit = Math.min(pagination?.limit ?? 10, 50);
    const offset = pagination?.offset ?? 0;

    const [nodes, totalCount] = await this.ordersService.findAllWithCount({
      limit,
      offset,
      status: filter?.status,
      dateFrom: filter?.dateFrom,
      dateTo: filter?.dateTo,
    });

    return {
      nodes,
      totalCount,
      pageInfo: { hasNextPage: offset + limit < totalCount },
    };
  }
}

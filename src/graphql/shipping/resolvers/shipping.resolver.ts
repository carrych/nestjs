import { Resolver, Query, Args } from '@nestjs/graphql';
import { ShippingService } from '../../../shipping/shipping.service';
import { ShippingType } from '../types/shipping.type';
import { ShippingConnection } from '../types/shipping-connection.type';
import { ShippingFilterInput } from '../inputs/shipping-filter.input';
import { ShippingPaginationInput } from '../inputs/shipping-pagination.input';

@Resolver(() => ShippingType)
export class ShippingResolver {
  constructor(private readonly shippingService: ShippingService) {}

  @Query(() => ShippingConnection, { name: 'shipments' })
  async getShipments(
    @Args('filter', { nullable: true }) filter?: ShippingFilterInput,
    @Args('pagination', { nullable: true }) pagination?: ShippingPaginationInput,
  ): Promise<ShippingConnection> {
    const limit = Math.min(pagination?.limit ?? 10, 50);
    const offset = pagination?.offset ?? 0;

    const [nodes, totalCount] = await this.shippingService.findAllWithCount(
      filter?.orderId,
      limit,
      offset,
    );

    return {
      nodes,
      totalCount,
      pageInfo: { hasNextPage: offset + limit < totalCount },
    };
  }
}

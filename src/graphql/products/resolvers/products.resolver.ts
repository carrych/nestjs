import { Resolver, Query, Args } from '@nestjs/graphql';
import { ProductsService } from '../../../products/products.service';
import { ProductType } from '../types/product.type';
import { ProductsConnection } from '../types/products-connection.type';
import { ProductsFilterInput } from '../inputs/products-filter.input';
import { ProductsPaginationInput } from '../inputs/products-pagination.input';

@Resolver(() => ProductType)
export class ProductsResolver {
  constructor(private readonly productsService: ProductsService) {}

  @Query(() => ProductsConnection, { name: 'products' })
  async getProducts(
    @Args('filter', { nullable: true }) filter?: ProductsFilterInput,
    @Args('pagination', { nullable: true }) pagination?: ProductsPaginationInput,
  ): Promise<ProductsConnection> {
    const limit = Math.min(pagination?.limit ?? 10, 50);
    const offset = pagination?.offset ?? 0;

    const [nodes, totalCount] = await this.productsService.findAllWithCount({
      limit,
      offset,
      brand: filter?.brand,
      search: filter?.search,
    });

    return {
      nodes,
      totalCount,
      pageInfo: { hasNextPage: offset + limit < totalCount },
    };
  }
}

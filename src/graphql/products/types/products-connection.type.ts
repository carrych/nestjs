import { ObjectType, Field, Int } from '@nestjs/graphql';
import { ProductType } from './product.type';

@ObjectType()
export class ProductsPageInfo {
  @Field()
  hasNextPage: boolean;
}

@ObjectType()
export class ProductsConnection {
  @Field(() => [ProductType])
  nodes: ProductType[];

  @Field(() => Int)
  totalCount: number;

  @Field(() => ProductsPageInfo)
  pageInfo: ProductsPageInfo;
}

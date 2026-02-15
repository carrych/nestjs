import { ObjectType, Field, Int } from '@nestjs/graphql';
import { OrderType } from './order.type';

@ObjectType()
export class PageInfo {
  @Field()
  hasNextPage: boolean;
}

@ObjectType()
export class OrdersConnection {
  @Field(() => [OrderType])
  nodes: OrderType[];

  @Field(() => Int)
  totalCount: number;

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

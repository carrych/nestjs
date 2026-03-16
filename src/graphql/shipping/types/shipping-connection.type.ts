import { ObjectType, Field, Int } from '@nestjs/graphql';
import { ShippingType } from './shipping.type';

@ObjectType()
export class ShippingPageInfo {
  @Field()
  hasNextPage: boolean;
}

@ObjectType()
export class ShippingConnection {
  @Field(() => [ShippingType])
  nodes: ShippingType[];

  @Field(() => Int)
  totalCount: number;

  @Field(() => ShippingPageInfo)
  pageInfo: ShippingPageInfo;
}

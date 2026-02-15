import { ObjectType, Field, Int } from '@nestjs/graphql';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItemType } from './order-item.type';

@ObjectType()
export class OrderType {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  orderNumber: number;

  @Field(() => Int)
  userId: number;

  @Field(() => OrderStatus)
  status: OrderStatus;

  @Field()
  createdAt: Date;

  @Field(() => [OrderItemType])
  items: OrderItemType[];
}

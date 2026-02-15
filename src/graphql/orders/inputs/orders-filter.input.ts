import { InputType, Field } from '@nestjs/graphql';
import { OrderStatus } from '../enums/order-status.enum';

@InputType()
export class OrdersFilterInput {
  @Field(() => OrderStatus, { nullable: true })
  status?: OrderStatus;

  @Field({ nullable: true, description: 'ISO 8601 date string' })
  dateFrom?: string;

  @Field({ nullable: true, description: 'ISO 8601 date string' })
  dateTo?: string;
}

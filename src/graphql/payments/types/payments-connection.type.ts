import { ObjectType, Field, Int } from '@nestjs/graphql';
import { PaymentType } from './payment.type';

@ObjectType()
export class PaymentsPageInfo {
  @Field()
  hasNextPage: boolean;
}

@ObjectType()
export class PaymentsConnection {
  @Field(() => [PaymentType])
  nodes: PaymentType[];

  @Field(() => Int)
  totalCount: number;

  @Field(() => PaymentsPageInfo)
  pageInfo: PaymentsPageInfo;
}

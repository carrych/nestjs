import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { PaymentStatus, PaymentMethod, PaymentType as PaymentTypeEnum } from '../enums/payment-enums';

@ObjectType()
export class PaymentType {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  orderId: number;

  @Field(() => Int)
  userId: number;

  @Field(() => String, { nullable: true })
  transactionNumber: string | null;

  @Field(() => Float)
  amount: string;

  @Field(() => PaymentStatus)
  status: PaymentStatus;

  @Field(() => PaymentTypeEnum)
  type: PaymentTypeEnum;

  @Field(() => PaymentMethod)
  method: PaymentMethod;

  @Field()
  createdAt: Date;
}

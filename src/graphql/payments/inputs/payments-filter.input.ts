import { InputType, Field, Int } from '@nestjs/graphql';
import { PaymentStatus } from '../enums/payment-enums';

@InputType()
export class PaymentsFilterInput {
  @Field(() => Int, { nullable: true })
  orderId?: number;

  @Field(() => PaymentStatus, { nullable: true })
  status?: PaymentStatus;
}

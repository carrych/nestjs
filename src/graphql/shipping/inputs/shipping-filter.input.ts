import { InputType, Field, Int } from '@nestjs/graphql';

@InputType()
export class ShippingFilterInput {
  @Field(() => Int, { nullable: true })
  orderId?: number;
}

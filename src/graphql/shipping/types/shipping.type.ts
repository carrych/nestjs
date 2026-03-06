import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { ShippingStatus } from '../enums/shipping-status.enum';

@ObjectType()
export class ShippingType {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  orderId: number;

  @Field(() => Int)
  userId: number;

  @Field(() => String, { nullable: true })
  trackingNumber: string | null;

  @Field(() => ShippingStatus)
  status: ShippingStatus;

  @Field(() => Float)
  declaredValue: string;

  @Field(() => Float, { nullable: true })
  shippingCost: string | null;

  @Field(() => Float, { nullable: true })
  weight: string | null;

  @Field(() => Int, { nullable: true })
  seatsCount: number | null;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field()
  createdAt: Date;

  @Field(() => Date, { nullable: true })
  receivedAt: Date | null;
}

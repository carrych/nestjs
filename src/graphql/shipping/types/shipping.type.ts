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

  @Field({ nullable: true })
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

  @Field({ nullable: true })
  description: string | null;

  @Field()
  createdAt: Date;

  @Field({ nullable: true })
  receivedAt: Date | null;
}

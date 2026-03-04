import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType('OrderProduct')
export class OrderProductType {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field()
  slug: string;

  @Field(() => String, { nullable: true })
  brand: string | null;

  @Field(() => Float)
  price: string;

  @Field()
  createdAt: Date;
}

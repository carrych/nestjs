import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class ProductType {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field()
  slug: string;

  @Field({ nullable: true })
  brand: string | null;

  @Field(() => Float)
  price: string;

  @Field()
  createdAt: Date;
}

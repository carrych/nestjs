import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class ProductType {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field()
  slug: string;

  @Field(() => String, { nullable: true })
  brand: string | null;

  @Field()
  visible: boolean;

  @Field()
  popular: boolean;

  @Field()
  published: boolean;

  @Field(() => String, { nullable: true })
  shortDescription: string | null;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => Float)
  price: string;

  @Field(() => Float)
  oldPrice: string;

  @Field(() => Float)
  specialPrice: string;

  @Field()
  createdAt: Date;
}

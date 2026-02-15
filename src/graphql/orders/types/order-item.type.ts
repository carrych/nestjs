import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { ProductType } from './product.type';

@ObjectType()
export class OrderItemType {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  productId: number;

  @Field(() => Int)
  amount: number;

  @Field(() => Float)
  price: string;

  @Field(() => Float)
  discount: string;

  @Field(() => ProductType)
  product: ProductType;
}

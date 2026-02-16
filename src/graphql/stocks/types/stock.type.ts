import { ObjectType, Field, Int } from '@nestjs/graphql';
import { ProductType } from '../../orders/types/product.type';

@ObjectType()
export class StockType {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  productId: number;

  @Field(() => Int)
  stock: number;

  @Field(() => Int)
  reserved: number;

  @Field()
  updatedAt: Date;

  @Field(() => ProductType)
  product: ProductType;
}

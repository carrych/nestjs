import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class ProductsFilterInput {
  @Field({ nullable: true })
  brand?: string;

  @Field({ nullable: true, description: 'Search by product name' })
  search?: string;
}

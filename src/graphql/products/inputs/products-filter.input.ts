import { InputType, Field } from '@nestjs/graphql';
import { IsOptional, IsString } from 'class-validator';

@InputType()
export class ProductsFilterInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  brand?: string;

  @Field({ nullable: true, description: 'Search by product name' })
  @IsOptional()
  @IsString()
  search?: string;
}

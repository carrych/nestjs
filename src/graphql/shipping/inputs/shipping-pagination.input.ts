import { InputType, Field, Int } from '@nestjs/graphql';
import { Min, Max, IsOptional, IsInt } from 'class-validator';

@InputType()
export class ShippingPaginationInput {
  @Field(() => Int, { defaultValue: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;

  @Field(() => Int, { defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset: number = 0;
}

import { InputType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsOptional } from 'class-validator';

@InputType()
export class ShippingFilterInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  orderId?: number;
}

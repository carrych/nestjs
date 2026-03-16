import { InputType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '../enums/order-status.enum';

@InputType()
export class OrdersFilterInput {
  @Field(() => OrderStatus, { nullable: true })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @Field({ nullable: true, description: 'ISO 8601 date string' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @Field({ nullable: true, description: 'ISO 8601 date string' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}

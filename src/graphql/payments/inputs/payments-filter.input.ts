import { InputType, Field, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { PaymentStatus } from '../enums/payment-enums';

@InputType()
export class PaymentsFilterInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  orderId?: number;

  @Field(() => PaymentStatus, { nullable: true })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}

import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentType } from '../enums/payment-type.enum';

export class CreatePaymentDto {
  @IsInt()
  orderId: number;

  @IsInt()
  userId: number;

  @IsString()
  @IsOptional()
  transactionNumber?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @IsEnum(PaymentType)
  @IsOptional()
  type?: PaymentType;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}

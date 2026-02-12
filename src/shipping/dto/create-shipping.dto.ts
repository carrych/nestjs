import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ShippingStatus } from '../enums/shipping-status.enum';

export class CreateShippingDto {
  @IsInt()
  orderId: number;

  @IsInt()
  userId: number;

  @IsString()
  @IsOptional()
  trackingNumber?: string;

  @IsNumber()
  @Min(0)
  declaredValue: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  shippingCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  weight?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  seatsCount?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ShippingStatus)
  @IsOptional()
  status?: ShippingStatus;
}

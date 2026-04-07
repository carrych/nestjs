import { ArrayMinSize, IsArray, IsInt, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateOrderDto {
  @IsInt()
  userId: number;

  @IsInt()
  @IsOptional()
  addressId?: number;

  @IsUUID()
  @IsOptional()
  idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class PresignDto {
  @IsIn(['product-image'])
  entityType: string;

  @IsString()
  @IsNotEmpty()
  entityId: string;

  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024) // 10 MB
  size: number;
}

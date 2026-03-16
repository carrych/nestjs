import { IsUUID } from 'class-validator';

export class CompleteDto {
  @IsUUID()
  fileId: string;
}

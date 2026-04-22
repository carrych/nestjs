import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { FilesService, PresignResult } from './files.service';
import { PresignDto } from './dto/presign.dto';
import { CompleteDto } from './dto/complete.dto';

@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  presign(@Body() dto: PresignDto, @CurrentUser() user: User): Promise<PresignResult> {
    return this.filesService.presign(dto, user.id);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Body() dto: CompleteDto,
    @CurrentUser() user: User,
  ): Promise<{ fileId: string; status: string; viewUrl: string }> {
    return this.filesService.complete(dto.fileId, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User): Promise<void> {
    return this.filesService.remove(id, user.id);
  }
}

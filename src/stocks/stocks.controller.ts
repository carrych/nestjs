import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';

import { StocksService } from './stocks.service';
import { UpdateStockDto } from './dto/update-stock.dto';

@Controller('stocks')
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  @Get()
  findAll() {
    return this.stocksService.findAll();
  }

  @Get('product/:productId')
  findByProductId(@Param('productId', ParseIntPipe) productId: number) {
    return this.stocksService.findByProductId(productId);
  }

  @Patch('product/:productId')
  update(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: UpdateStockDto,
  ) {
    return this.stocksService.updateByProductId(productId, dto);
  }
}

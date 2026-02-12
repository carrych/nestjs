import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Stock } from './entities/stock.entity';
import { UpdateStockDto } from './dto/update-stock.dto';

@Injectable()
export class StocksService {
  constructor(
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
  ) {}

  async findAll(): Promise<Stock[]> {
    return this.stockRepository.find({
      relations: { product: true },
      order: { productId: 'ASC' },
    });
  }

  async findByProductId(productId: number): Promise<Stock> {
    const stock = await this.stockRepository.findOne({
      where: { productId },
      relations: { product: true },
    });
    if (!stock) {
      throw new NotFoundException(`Stock for product #${productId} not found`);
    }
    return stock;
  }

  async updateByProductId(productId: number, dto: UpdateStockDto): Promise<Stock> {
    const stock = await this.findByProductId(productId);
    Object.assign(stock, dto);
    return this.stockRepository.save(stock);
  }
}

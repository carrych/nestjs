import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';

import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.productRepository.create({
      ...dto,
      price: dto.price != null ? String(dto.price) : undefined,
      oldPrice: dto.oldPrice != null ? String(dto.oldPrice) : undefined,
      specialPrice: dto.specialPrice != null ? String(dto.specialPrice) : undefined,
    });
    return this.productRepository.save(product);
  }

  async findAll(query: QueryProductDto): Promise<Product[]> {
    const where = this.buildWhere(query);
    const { limit = 10, offset = 0 } = query;

    return this.productRepository.find({
      where,
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findAllWithCount(query: QueryProductDto): Promise<[Product[], number]> {
    const where = this.buildWhere(query);
    const { limit = 10, offset = 0 } = query;

    return this.productRepository.findAndCount({
      where,
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findByIds(ids: number[]): Promise<Product[]> {
    return this.productRepository.find({ where: { id: In(ids) } });
  }

  private buildWhere(query: QueryProductDto): Record<string, unknown> {
    const { brand, search } = query;
    const where: Record<string, unknown> = {};

    if (brand) where.brand = brand;
    if (search) where.name = ILike(`%${search}%`);

    return where;
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product #${id} not found`);
    }
    return product;
  }

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    const mapped = {
      ...dto,
      price: dto.price != null ? String(dto.price) : undefined,
      oldPrice: dto.oldPrice != null ? String(dto.oldPrice) : undefined,
      specialPrice: dto.specialPrice != null ? String(dto.specialPrice) : undefined,
    };
    Object.assign(product, mapped);
    return this.productRepository.save(product);
  }

  async remove(id: number): Promise<void> {
    const product = await this.findOne(id);
    await this.productRepository.remove(product);
  }
}
